export default function CockpitLoading() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <span className="text-[#00d4ff] font-mono text-xs tracking-widest uppercase animate-pulse">
          ● Loading
        </span>
      </div>
    </div>
  )
}
