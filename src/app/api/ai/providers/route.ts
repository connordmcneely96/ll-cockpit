import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    ok: true,
    providers: {
      anthropic: {
        configured: !!process.env.ANTHROPIC_API_KEY,
        key_preview: process.env.ANTHROPIC_API_KEY
          ? `sk-ant-...${process.env.ANTHROPIC_API_KEY.slice(-4)}`
          : null,
      },
      openai: { configured: !!process.env.OPENAI_API_KEY },
      gemini: { configured: !!process.env.GEMINI_API_KEY },
      workers_ai: { configured: true },
    },
  })
}
