-- Knowledge pipeline tables (append-only — do not modify existing tables)

CREATE TABLE IF NOT EXISTS study_nodes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,
  source TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_study_nodes_category ON study_nodes(category);

CREATE TABLE IF NOT EXISTS sprint_items (
  id TEXT PRIMARY KEY,
  sprint_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority INTEGER NOT NULL DEFAULT 2,
  agent TEXT,
  category TEXT,
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_sprint_items_sprint ON sprint_items(sprint_number);
CREATE INDEX IF NOT EXISTS idx_sprint_items_status ON sprint_items(status);
