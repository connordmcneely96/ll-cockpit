export const runtime = 'edge'

import { KanbanBoard } from './KanbanBoard'

export default function PipelinePage() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-gold/12 bg-navy-2 shrink-0">
        <p className="text-text2 font-condensed font-semibold text-sm uppercase tracking-wider">
          Pipeline
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <KanbanBoard />
      </div>
    </div>
  )
}
