import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const CF_ACCOUNT_ID = Deno.env.get('CF_ACCOUNT_ID');
    const CF_AI_TOKEN = Deno.env.get('CF_AI_TOKEN');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!CF_ACCOUNT_ID || !CF_AI_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'Missing CF credentials' }),
        { status: 500, headers: corsHeaders }
      );
    }

    const body = await req.json() as { query: string; limit?: number; tenant_id?: string; category?: string };
    const { query, limit = 5, tenant_id = 'default', category } = body;

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Missing query' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Embed the query using Cloudflare Workers AI
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/baai/bge-base-en-v1.5`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CF_AI_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: query }),
      }
    );

    if (!cfRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Embedding failed' }),
        { status: 500, headers: corsHeaders }
      );
    }

    const cfData = await cfRes.json() as { result: { data: number[][] } };
    const embedding = cfData.result?.data?.[0];

    if (!embedding) {
      return new Response(
        JSON.stringify({ error: 'No embedding returned' }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Run semantic search via RPC (required — PostgREST does not support vector operators directly)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.rpc('search_knowledge', {
      query_embedding: `[${embedding.join(',')}]`,
      match_count: Math.min(limit, 10),
      filter_tenant_id: tenant_id,
      filter_category: category ?? null,
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ results: data, count: data?.length ?? 0 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: corsHeaders }
    );
  }
});
