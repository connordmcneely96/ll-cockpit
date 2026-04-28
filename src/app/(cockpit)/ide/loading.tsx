export default function IdeLoading() {
  return (
    <div className="flex h-full">
      {/* File tree skeleton */}
      <div className="w-56 border-r border-[#1e2d3d] p-3 flex flex-col gap-2">
        {[60, 80, 50, 70, 55].map((w, i) => (
          <div
            key={i}
            className="h-4 rounded bg-[#1e2d3d] animate-pulse"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>

      {/* Editor skeleton */}
      <div className="flex-1 p-4 flex flex-col gap-2">
        {/* Tab bar */}
        <div className="flex gap-2 mb-2">
          <div className="w-24 h-7 rounded bg-[#111827] border border-[#1e2d3d] animate-pulse" />
        </div>
        {/* Code lines */}
        {[70, 90, 55, 80, 40, 75, 60, 85, 45, 65].map((w, i) => (
          <div
            key={i}
            className="h-4 rounded bg-[#1e2d3d] animate-pulse"
            style={{ width: `${w}%`, opacity: 1 - i * 0.06 }}
          />
        ))}
      </div>
    </div>
  )
}
