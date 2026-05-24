CREATE TABLE design_brief_sections (
  id                TEXT PRIMARY KEY,
  brief_id          TEXT NOT NULL,
  subtask_short_id  TEXT NOT NULL,
  section_slug      TEXT NOT NULL,
  section_type_slug TEXT,
  sort_order        INTEGER NOT NULL,
  settings_json     TEXT,
  scheme_id         TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  UNIQUE(brief_id, subtask_short_id)
);
CREATE INDEX idx_brief_sections_order ON design_brief_sections(brief_id, sort_order);
