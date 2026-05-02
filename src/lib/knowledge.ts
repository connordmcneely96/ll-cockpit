import { nanoid } from 'nanoid';

export interface StudyNode {
  id: string;
  title: string;
  category: string;
  content: string;
  tags?: string;
  source?: string;
}

export interface SprintItem {
  id: string;
  sprint_number: number;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 1 | 2 | 3;
  agent?: string;
  category?: string;
}

export function buildEmbedContent(
  type: 'study_node' | 'sprint_item',
  data: StudyNode | SprintItem
): string {
  if (type === 'study_node') {
    const n = data as StudyNode;
    return [n.title, n.category, n.content, n.tags].filter(Boolean).join(' | ');
  }
  const s = data as SprintItem;
  return [
    `Sprint ${s.sprint_number}`,
    s.title,
    s.description,
    s.agent,
    s.category,
    s.status,
  ].filter(Boolean).join(' | ');
}

export function generateId(): string {
  return nanoid();
}
