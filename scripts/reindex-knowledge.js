#!/usr/bin/env node
// NEXUS Knowledge Backfill — uses wrangler CLI directly (no API token needed)
// Usage: node scripts/reindex-knowledge.js
// Must be run from repo root where wrangler.toml lives.

const { execSync } = require('child_process');
const https = require('https');

const DB = 'll-cockpit-db';
const VECTORIZE_INDEX = 'nexus-knowledge';
const ACCOUNT_ID = 'd3dbdd3e1ebbc28edf0ce756d9841490';
const AI_MODEL = '@cf/baai/bge-base-en-v1.5';

function d1(sql) {
  const escaped = sql.replace(/"/g, '\\"');
  const out = execSync(
    `npx wrangler d1 execute ${DB} --remote --json --command="${escaped}"`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const parsed = JSON.parse(out);
  return parsed[0]?.results ?? [];
}

function embed(text) {
  return new Promise((resolve, reject) => {
    const token = execSync('npx wrangler auth token 2>/dev/null || echo ""', {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    // Use wrangler ai run instead of REST API
    const safe = text.replace(/'/g, ' ').slice(0, 500);
    try {
      const out = execSync(
        `npx wrangler ai run ${AI_MODEL} --json -- "${safe}"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const result = JSON.parse(out);
      const vector = result?.data?.[0] ?? result?.result?.data?.[0];
      if (!vector) throw new Error('No vector in response: ' + out.slice(0, 200));
      resolve(vector);
    } catch (e) {
      reject(new Error('embed failed: ' + e.message.slice(0, 200)));
    }
  });
}

function vectorizeUpsert(vectors) {
  // Write NDJSON to temp file then use wrangler vectorize insert
  const ndjson = vectors.map(v => JSON.stringify(v)).join('\n');
  const tmpFile = `/tmp/vect_${Date.now()}.ndjson`;
  require('fs').writeFileSync(tmpFile, ndjson);
  execSync(
    `npx wrangler vectorize insert ${VECTORIZE_INDEX} --file=${tmpFile}`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  require('fs').unlinkSync(tmpFile);
}

async function processRecords(records, table, buildContent, buildMetadata) {
  let succeeded = 0, failed = 0;
  for (const record of records) {
    try {
      const text = buildContent(record);
      const values = await embed(text);
      const metadata = buildMetadata(record);
      vectorizeUpsert([{ id: `${table}::${record.id}`, values, metadata }]);
      console.log(`  ✅ ${record.title ?? record.id}`);
      succeeded++;
    } catch (err) {
      console.error(`  ❌ ${record.title ?? record.id} — ${err.message}`);
      failed++;
    }
  }
  return { succeeded, failed };
}

async function main() {
  console.log('\n🔁 NEXUS Knowledge Backfill — wrangler CLI mode\n');

  console.log('Fetching study_nodes...');
  const studyNodes = d1('SELECT id, title, category, content, tags, source, tenant_id FROM study_nodes ORDER BY created_at ASC');
  console.log(`  Found ${studyNodes.length} study_nodes\n`);

  const snResult = await processRecords(
    studyNodes, 'study_nodes',
    r => [r.title, r.category, r.content, r.tags].filter(Boolean).join(' | '),
    r => ({ type: 'study_node', title: r.title ?? '', content: (r.content ?? '').slice(0, 1000), category: r.category ?? '', source: r.source ?? '', tenant_id: r.tenant_id ?? 'default', table_name: 'study_nodes' })
  );

  console.log('\nFetching sprint_items...');
  const sprintItems = d1('SELECT id, sprint_number, title, description, status, agent, category, tenant_id FROM sprint_items ORDER BY created_at ASC');
  console.log(`  Found ${sprintItems.length} sprint_items\n`);

  const siResult = await processRecords(
    sprintItems, 'sprint_items',
    r => [`Sprint ${r.sprint_number}`, r.title, r.description, r.agent, r.category, r.status].filter(Boolean).join(' | '),
    r => ({ type: 'sprint_item', title: r.title ?? '', content: (r.description ?? '').slice(0, 1000), category: r.category ?? '', source: '', tenant_id: r.tenant_id ?? 'default', table_name: 'sprint_items' })
  );

  const total = snResult.succeeded + siResult.succeeded;
  const totalFailed = snResult.failed + siResult.failed;
  console.log(`\n✅ Reindexed ${total} records. Failed: ${totalFailed}.`);
  console.log(`   study_nodes: ${snResult.succeeded} ok, ${snResult.failed} failed`);
  console.log(`   sprint_items: ${siResult.succeeded} ok, ${siResult.failed} failed`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
