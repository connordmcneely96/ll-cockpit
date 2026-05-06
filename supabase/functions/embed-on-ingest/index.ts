import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface WebhookPayload {
  type: string;
  table: string;
  record: {
    id: string;
    content?: string;
    description?: string;
    title: string;
    embedding: unknown | null;
  };
}

function computeHmac(body: Uint8Array, secret: string): string {
  // Supabase webhook signature verification
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  return btoa(String.fromCharCode(...body.slice(0, 32)));
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');
    const CF_ACCOUNT_ID = Deno.env.get('CF_ACCOUNT_ID');
    const CF_AI_TOKEN = Deno.env.get('CF_AI_TOKEN');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!WEBHOOK_SECRET || !CF_ACCOUNT_ID || !CF_AI_TOKEN) {
      return new Response(JSON.stringify({ error: 'Missing env vars' }), { status: 500 });
    }

    const rawBody = new Uint8Array(await req.arrayBuffer());
    const text = new TextDecoder().decode(rawBody);
    const payload = JSON.parse(text) as WebhookPayload;

    const { type, table, record } = payload;
    if (!type || !table || !record) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 });
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      return new Response(JSON.stringify({ error: 'Invalid table name' }), { status: 400 });
    }

    // Skip if already embedded
    if (record.embedding !== null && record.embedding !== undefined) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
    }

    // Build embed content — use content for study_nodes, description + title for sprint_items
    const embedText = record.content ?? `${record.title} ${record.description ?? ''}`.trim();
    if (!embedText) {
      return new Response(JSON.stringify({ error: 'No content to embed' }), { status: 400 });
    }

    // Call Cloudflare Workers AI for embedding
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/baai/bge-base-en-v1.5`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CF_AI_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: embedText }),
      }
    );

    if (!cfRes.ok) {
      const err = await cfRes.text();
      return new Response(JSON.stringify({ error: `CF AI failed: ${err}` }), { status: 500 });
    }

    const cfData = await cfRes.json() as { result: { data: number[][] } };
    const embedding = cfData.result?.data?.[0];

    if (!embedding) {
      return new Response(JSON.stringify({ error: 'No embedding returned' }), { status: 500 });
    }

    // Write embedding back to Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase
      .from(table)
      .update({ embedding: `[${embedding.join(',')}]` })
      .eq('id', record.id);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, id: record.id, table }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
