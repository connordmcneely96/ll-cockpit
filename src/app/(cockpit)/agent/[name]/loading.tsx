export default function AgentLoading() {
  return (
    <div className="flex flex-col h-full p-6 gap-4">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#1e2d3d] animate-pulse" />
        <div className="w-32 h-5 rounded bg-[#1e2d3d] animate-pulse" />
        <div className="w-16 h-5 rounded bg-[#1e2d3d] animate-pulse ml-2" />
      </div>

      {/* Message skeletons */}
      <div className="flex-1 flex flex-col gap-3 overflow-hidden">
        {[80, 60, 90, 40].map((w, i) => (
          <div key={i} className={`flex ${i % 2 === 1 ? 'justify-end' : ''}`}>
            <div
              className="h-10 rounded-lg bg-[#111827] animate-pulse"
              style={{ width: `${w}%` }}
            />
          </div>
        ))}
      </div>

      {/* Input skeleton */}
      <div className="h-12 rounded-lg bg-[#111827] border border-[#1e2d3d] animate-pulse" />
    </div>
  )
}
