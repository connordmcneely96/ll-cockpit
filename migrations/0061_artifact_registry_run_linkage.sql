-- 0061: link CAD binary artifacts back to their pipeline run + subtask.
-- Additive, nullable — existing rows unaffected. SQLite requires one ADD COLUMN per statement.
ALTER TABLE artifact_registry ADD COLUMN pipeline_run_id TEXT;
ALTER TABLE artifact_registry ADD COLUMN subtask_id TEXT;
CREATE INDEX IF NOT EXISTS idx_artifact_registry_pipeline_run
  ON artifact_registry (pipeline_run_id);
