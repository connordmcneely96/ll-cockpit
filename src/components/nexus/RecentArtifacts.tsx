import type { ArtifactRow } from '@/lib/dashboard-data'

const VERIF_COLOR: Record<string, string> = {
  'Verified': 'var(--d-success)',
  'Failed checks': 'var(--d-error)',
  'Needs review': 'var(--d-warning)',
}

interface Props { artifacts: ArtifactRow[] }

export default function RecentArtifacts({ artifacts }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase" style={{ color: 'var(--t-tx3)', letterSpacing: '0.08em' }}>
        Recent Artifacts
      </h2>
      {artifacts.length === 0 ? (
        <div className="glass-card px-4 py-3 text-xs" style={{ color: 'var(--t-tx3)' }}>
          No artifacts produced yet.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {artifacts.map(a => (
            <div key={a.id} className="glass-card flex items-center gap-3 px-3 py-2">
              <a
                href={`/api/library/artifacts/${a.id}/content`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs flex-1 truncate hover:underline"
                style={{ color: 'var(--t-tx1)' }}
                title="Open the deliverable"
              >
                {a.artifact_name}
              </a>
              <span className="text-xs shrink-0" style={{ color: 'var(--t-tx3)' }}>{a.artifact_type}</span>
              <span className="text-xs shrink-0" style={{ color: 'var(--t-tx3)' }}>{a.producing_agent}</span>
              <span
                className="text-xs px-2 py-0.5 rounded shrink-0"
                style={{
                  borderRadius: 'var(--d-radius-sm)',
                  color: VERIF_COLOR[a.verification] ?? 'var(--t-tx3)',
                  border: `1px solid ${VERIF_COLOR[a.verification] ?? 'var(--t-glass-bdr)'}`,
                  background: 'color-mix(in srgb, currentColor 8%, transparent)',
                }}
              >
                {a.verification}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
