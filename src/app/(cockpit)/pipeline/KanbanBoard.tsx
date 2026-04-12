'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

type Status = 'backlog' | 'in_progress' | 'review' | 'done'

interface Task {
  id: string
  title: string
  agent: string
  status: Status
  priority: 'low' | 'medium' | 'high'
}

const COLUMNS: { id: Status; label: string; color: string }[] = [
  { id: 'backlog', label: 'Backlog', color: '#6b7a99' },
  { id: 'in_progress', label: 'In Progress', color: '#f5c842' },
  { id: 'review', label: 'Review', color: '#00d4ff' },
  { id: 'done', label: 'Done', color: '#2ed573' },
]

const INITIAL_TASKS: Task[] = [
  { id: '1', title: 'Set up Supabase OAuth', agent: 'NEXUS', status: 'done', priority: 'high' },
  { id: '2', title: 'Configure D1 schema', agent: 'FORGE', status: 'done', priority: 'high' },
  { id: '3', title: 'Build streaming API', agent: 'FORGE', status: 'in_progress', priority: 'high' },
  { id: '4', title: 'Scan Upwork for leads', agent: 'SCOUT', status: 'backlog', priority: 'medium' },
  { id: '5', title: 'SENTINEL QA pass', agent: 'SENTINEL', status: 'review', priority: 'high' },
]

const priorityBadge: Record<Task['priority'], 'red' | 'gold' | 'default'> = {
  high: 'red', medium: 'gold', low: 'default'
}

export function KanbanBoard() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS)
  const [dragging, setDragging] = useState<string | null>(null)

  const move = (taskId: string, newStatus: Status) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    )
  }

  return (
    <div className="flex gap-4 h-full overflow-x-auto p-4">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.id)
        return (
          <div
            key={col.id}
            className="flex flex-col w-64 shrink-0"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragging) move(dragging, col.id)
              setDragging(null)
            }}
          >
            {/* Column header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                <span className="text-text2 font-condensed font-semibold text-sm uppercase tracking-wider">
                  {col.label}
                </span>
              </div>
              <span className="text-text3 font-mono text-xs bg-navy-4 px-1.5 py-0.5 rounded">
                {colTasks.length}
              </span>
            </div>

            {/* Tasks */}
            <div className="flex-1 space-y-2 min-h-16">
              {colTasks.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={() => setDragging(task.id)}
                  onDragEnd={() => setDragging(null)}
                  className={dragging === task.id ? 'opacity-50' : ''}
                >
                  <Card className="cursor-grab active:cursor-grabbing">
                    <p className="text-text1 font-mono text-xs leading-relaxed mb-2">
                      {task.title}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-text3 font-mono text-[10px]">{task.agent}</span>
                      <Badge variant={priorityBadge[task.priority]}>{task.priority}</Badge>
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
