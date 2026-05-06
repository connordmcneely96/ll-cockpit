import { getBindings } from '@/lib/cloudflare';
import { buildEmbedContent, generateId } from '@/lib/knowledge';
import { NextRequest, NextResponse } from 'next/server';

async function syncToSupabase(
  type: 'study_node' | 'sprint_item',
  table: string,
  id: string,
  data: Record<string, unknown>,
  now: number
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  const payload = type === 'study_node'
    ? {
        id,
        title: data.title,
        category: data.category,
        content: data.content,
        tags: data.tags ?? null,
        source: data.source ?? null,
        tenant_id: (data.tenant_id as string) ?? 'default',
        created_at: now,
        updated_at: now,
      }
    : {
        id,
        sprint_number: data.sprint_number,
        title: data.title,
        description: data.description ?? null,
        status: data.status ?? 'todo',
        priority: data.priority ?? 2,
        agent: data.agent ?? null,
        category: data.category ?? null,
        tenant_id: (data.tenant_id as string) ?? 'default',
        created_at: now,
        updated_at: now,
      };

  await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(payload),
  });
}

interface KnowledgeRequestBody {
  type: 'study_node' | 'sprint_item';
  data: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const { DB, KNOWLEDGE_QUEUE } = getBindings();
  const body = await req.json() as KnowledgeRequestBody;
  const { type, data } = body;

  if (!type || !data) {
    return NextResponse.json({ error: 'Missing type or data' }, { status: 400 });
  }

  if (type !== 'study_node' && type !== 'sprint_item') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const id = (data.id as string) || generateId();
  const now = Math.floor(Date.now() / 1000);
  const table = type === 'study_node' ? 'study_nodes' : 'sprint_items';

  if (type === 'study_node') {
    await DB.prepare(
      `INSERT INTO study_nodes (id, title, category, content, tags, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title, category=excluded.category,
         content=excluded.content, tags=excluded.tags,
         updated_at=excluded.updated_at`
    ).bind(
      id,
      data.title ?? null,
      data.category ?? null,
      data.content ?? null,
      data.tags ?? null,
      data.source ?? null,
      now,
      now
    ).run();
  } else {
    await DB.prepare(
      `INSERT INTO sprint_items (id, sprint_number, title, description, status, priority, agent, category, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title, description=excluded.description,
         status=excluded.status, updated_at=excluded.updated_at`
    ).bind(
      id,
      data.sprint_number ?? null,
      data.title ?? null,
      data.description ?? null,
      data.status ?? 'todo',
      data.priority ?? 2,
      data.agent ?? null,
      data.category ?? null,
      now,
      now
    ).run();
  }

  syncToSupabase(type, table, id, data, now).catch(console.error);

  const embedContent = buildEmbedContent(type, { ...data, id } as Parameters<typeof buildEmbedContent>[1]);
  await KNOWLEDGE_QUEUE.send({
    id,
    table,
    content: embedContent,
    metadata: { type, title: data.title as string },
  });

  return NextResponse.json({ id, table, queued: true });
}
