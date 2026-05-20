CREATE TABLE IF NOT EXISTS design_section_types (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  thumbnail_url TEXT,
  schema_json TEXT NOT NULL,
  default_props_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_section_types_category ON design_section_types(category);
