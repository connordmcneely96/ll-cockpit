import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const runtime = 'edge'

// Tool execution endpoint — currently stubs pending real integrations.
// Each tool implementation will be added here as integrations are wired up.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  // Tool router — add real implementations as integrations are built
  switch (name) {
    case 'search_upwork':
      return NextResponse.json({ results: [], message: 'Upwork integration pending' })

    case 'write_file':
      // In production: write to R2 or invoke a filesystem MCP tool
      return NextResponse.json({ ok: true, path: body.path, message: 'File write logged (integration pending)' })

    case 'run_command':
      // In production: execute via a sandboxed worker or MCP tool
      return NextResponse.json({ ok: false, message: 'Command execution requires additional setup' })

    default:
      return NextResponse.json({ error: `Unknown tool: ${name}` }, { status: 404 })
  }
}
