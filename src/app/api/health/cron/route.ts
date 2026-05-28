import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

const KNOWN_JOBS = [
  { job_name: 'scout_outreach_batch',  display: 'SCOUT Outreach',    schedule: '0 9 * * *'   },
  { job_name: 'oracle_daily_digest',   display: 'ORACLE Digest',     schedule: '0 12 * * *'  },
  { job_name: 'research_detector',     display: 'Research Detector', schedule: '0 * * * *'   },
  { job_name: 'meta_cognition_audit',  display: 'META-COGNITION',    schedule: '0 0 * * 0'   },
] as const

export async function GET() {
  try {
    const { env } = await getCloudflareContext()

    const jobs = await Promise.all(
      KNOWN_JOBS.map(async (job) => {
        const result = await env.DB.prepare(
          'SELECT id, status, run_at, duration_ms, log_ref, error_msg FROM cron_runs WHERE job_name = ? ORDER BY run_at DESC LIMIT 7'
        ).bind(job.job_name).all<{
          id: string
          status: string
          run_at: number
          duration_ms: number | null
          log_ref: string | null
          error_msg: string | null
        }>()

        // Reverse so most recent is rightmost (index 6)
        const runs = [...result.results].reverse()

        return {
          job_name: job.job_name,
          display: job.display,
          schedule: job.schedule,
          runs,
        }
      })
    )

    return NextResponse.json({ ok: true, jobs })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// Allow writing a run result (called by the cron handler when it fires)
export async function POST(req: Request) {
  try {
    const { env } = await getCloudflareContext()
    const body = await req.json() as {
      job_name: string
      status: 'ok' | 'failed' | 'skip' | 'running'
      duration_ms?: number
      log_ref?: string
      error_msg?: string
    }

    const id = crypto.randomUUID()
    const run_at = Date.now()

    await env.DB.prepare(
      'INSERT INTO cron_runs (id, job_name, status, run_at, duration_ms, log_ref, error_msg) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, body.job_name, body.status, run_at, body.duration_ms ?? null, body.log_ref ?? null, body.error_msg ?? null).run()

    return NextResponse.json({ ok: true, id })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
