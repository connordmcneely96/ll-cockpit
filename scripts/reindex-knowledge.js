#!/usr/bin/env node
// Backfill script: re-embeds all study_nodes and sprint_items into nexus-knowledge Vectorize.
// Usage:
//   CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<account_id> node scripts/reindex-knowledge.js
//
// Idempotent: Vectorize upsert is safe to run repeatedly (same vector ID = overwrite).
// No embed_status column exists in D1, so ALL records are processed each run.

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const DB_ID = '831eeccf-60bc-4378-8a3b-71dfb910756e';
const VECTORIZE_INDEX = 'nexus-knowledge';
const AI_MODEL = '@cf/baai/bge-base-en-v1.5';
const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`;

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error('Error: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set.');
  process.exit(1);
}

async function cfFetch(path, options = {}) {
  const res = await fetch(`${CF_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(`CF API error ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.result;
}

async function queryD1(sql) {
  const result = await cfFetch(`/d1/database/${DB_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({ sql }),
  });
  return result[0]?.results ?? [];
}

async function embed(text) {
  const result = await cfFetch(`/ai/run/${encodeURIComponent(AI_MODEL)}`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  // Response shape: { data: number[][] }
  const vector = result?.data?.[0];
  if (!vector) throw new Error('Empty embedding response');
  return vector;
}

async function upsertVectors(vectors) {
  // Vectorize v2 upsert expects NDJSON body, not JSON array
  const ndjson = vectors.map((v) => JSON.stringify(v)).join('\n');
  const res = await fetch(
    `${CF_BASE}/vectorize/v2/indexes/${VECTORIZE_INDEX}/upsert`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/x-ndjson',
      },
      body: ndjson,
    }
  );
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(`Vectorize upsert error ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.result;
}

async function processRecords(records, table, buildContent, buildMetadata) {
  let succeeded = 0;
  let failed = 0;

  for (const record of records) {
    try {
      const text = buildContent(record);
      const values = await embed(text);
      const metadata = buildMetadata(record);

      await upsertVectors([{
        id: `${table}::${record.id}`,
        values,
        metadata,
      }]);

      console.log(`  ✅ Reindexed: ${record.title ?? record.id} [${record.id}]`);
      succeeded++;
    } catch (err) {
      console.error(`  ❌ Failed: ${record.title ?? record.id} [${record.id}] — ${err.message}`);
      failed++;
    }
  }

  return { succeeded, failed };
}

async function main() {
  console.log(`\n🔁 NEXUS Knowledge Backfill — nexus-knowledge Vectorize index\n`);

  // --- study_nodes ---
  console.log('Fetching study_nodes from D1...');
  const studyNodes = await queryD1('SELECT id, title, category, content, tags, source, tenant_id FROM study_nodes ORDER BY created_at ASC');
  console.log(`  Found ${studyNodes.length} study_nodes\n`);

  const snResult = await processRecords(
    studyNodes,
    'study_nodes',
    (r) => [r.title, r.category, r.content, r.tags].filter(Boolean).join(' | '),
    (r) => ({
      type: 'study_node',
      title: r.title ?? '',
      content: (r.content ?? '').slice(0, 1000),
      category: r.category ?? '',
      source: r.source ?? '',
      tenant_id: r.tenant_id ?? 'default',
      table_name: 'study_nodes',
    })
  );

  // --- sprint_items ---
  console.log('\nFetching sprint_items from D1...');
  const sprintItems = await queryD1('SELECT id, sprint_number, title, description, status, agent, category, tenant_id FROM sprint_items ORDER BY created_at ASC');
  console.log(`  Found ${sprintItems.length} sprint_items\n`);

  const siResult = await processRecords(
    sprintItems,
    'sprint_items',
    (r) => [`Sprint ${r.sprint_number}`, r.title, r.description, r.agent, r.category, r.status].filter(Boolean).join(' | '),
    (r) => ({
      type: 'sprint_item',
      title: r.title ?? '',
      content: (r.description ?? '').slice(0, 1000),
      category: r.category ?? '',
      source: '',
      tenant_id: r.tenant_id ?? 'default',
      table_name: 'sprint_items',
    })
  );

  const total = snResult.succeeded + siResult.succeeded;
  const totalFailed = snResult.failed + siResult.failed;
  console.log(`\n✅ Reindexed ${total} records. Failed: ${totalFailed}.`);
  console.log(`   study_nodes: ${snResult.succeeded} ok, ${snResult.failed} failed`);
  console.log(`   sprint_items: ${siResult.succeeded} ok, ${siResult.failed} failed`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
