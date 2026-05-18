-- Sprint 18K Phase A — design_brief_files
-- Tracks real files written to R2 for each brief iteration.
-- R2 key pattern: design/{briefId}/files/{file_path}
--
-- This table is the authoritative source for Phase B's files API.
-- The design worker's GET /api/design/briefs/[id]/files will read from here
-- (with virtual-extraction fallback for pre-18K iterations that have no rows).
--
-- file_type CHECK: 'jsx' rows only written when ASSEMBLER finds a
-- <script type="text/jsx"> block in the assembled HTML. Rare today, reserved.

CREATE TABLE IF NOT EXISTS design_brief_files (
  id           TEXT    PRIMARY KEY,
  brief_id     TEXT    NOT NULL,
  iteration_id TEXT    NOT NULL,
  user_id      TEXT    NOT NULL,
  file_path    TEXT    NOT NULL,   -- relative path e.g. "pages/index.html"
  r2_key       TEXT    NOT NULL,   -- full R2 key e.g. "design/{briefId}/files/pages/index.html"
  file_type    TEXT    NOT NULL CHECK(file_type IN ('html', 'css', 'jsx', 'json')),
  source       TEXT    NOT NULL CHECK(source IN ('assembler', 'composer', 'designer')),
  byte_size    INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (brief_id) REFERENCES design_briefs(id)
);

CREATE INDEX IF NOT EXISTS idx_dbf_brief_iter
  ON design_brief_files(brief_id, iteration_id);

CREATE INDEX IF NOT EXISTS idx_dbf_user
  ON design_brief_files(user_id);
