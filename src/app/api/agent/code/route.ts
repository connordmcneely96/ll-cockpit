import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      filename?: string
      language?: string
      code?: string
      instruction?: string
      model?: string
    }

    const { filename, language, code, instruction, model } = body

    if (!filename || !language || !code || !instruction) {
      return NextResponse.json(
        { ok: false, error: 'filename, language, code, and instruction are required' },
        { status: 400 }
      )
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'ANTHROPIC_API_KEY not configured' },
        { status: 503 }
      )
    }

    const system = `You are an expert code assistant. The user will provide a file and an instruction. Return ONLY the complete updated file content with no explanation, no markdown, no code fences. Return raw code only.`

    const userMessage = `File: ${filename}\nLanguage: ${language}\nInstruction: ${instruction}\n\nCurrent code:\n${code}`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model ?? 'claude-sonnet-4-5',
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    const data = await res.json() as { content?: Array<{ text: string }>; usage?: object }
    const updatedCode = data.content?.[0]?.text ?? ''
    const usage = data.usage ?? {}

    return NextResponse.json({ ok: true, code: updatedCode, filename, language, usage })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
