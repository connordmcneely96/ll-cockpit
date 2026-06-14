export default function NexusPage() {
  return (
    <div className="flex flex-col gap-3">
      <h1
        className="text-3xl font-bold"
        style={{ color: 'var(--t-tx1)', fontFamily: 'var(--font-condensed), sans-serif' }}
      >
        Good morning, Connor. NEXUS PRIME is ready.
      </h1>
      <p className="text-sm" style={{ color: 'var(--t-tx2)' }}>
        What are we building, running, or deploying today?
      </p>
    </div>
  )
}
