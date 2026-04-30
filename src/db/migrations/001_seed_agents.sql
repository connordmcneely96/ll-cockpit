INSERT OR REPLACE INTO agents (id, name, display_name, role, color, model_default, status, badge, can_deploy, can_write_files, can_send_email, can_delete, read_only, requires_approval, system_prompt_kv_key, tools_json) VALUES
  ('NEXUS', 'nexus', 'NEXUS', 'Master Orchestrator', '#f5c842', 'claude-sonnet-4-6', 'active', 'READ', 0, 0, 0, 0, 1, '[]', 'prompt:NEXUS', '[]'),
  ('SCOUT', 'scout', 'SCOUT', 'Lead Intelligence', '#00d4ff', 'claude-sonnet-4-6', 'active', 'WRITE', 0, 0, 1, 0, 0, '["send_email","submit_proposal"]', 'prompt:SCOUT', '["search_upwork","send_email","submit_proposal"]'),
  ('INTAKE', 'intake', 'INTAKE', 'Client Onboarding', '#2ed573', 'claude-sonnet-4-6', 'active', 'WRITE', 0, 1, 1, 0, 0, '["send_email","write_file"]', 'prompt:INTAKE', '["write_file","send_email"]'),
  ('FORGE', 'forge', 'FORGE', 'Full-Stack Engineer', '#f5c842', 'claude-sonnet-4-6', 'active', 'WRITE', 0, 1, 0, 0, 0, '["write_file","delete_file","run_command"]', 'prompt:FORGE', '["write_file","delete_file","run_command"]'),
  ('BUILDER', 'builder', 'BUILDER', 'Autonomous App Builder', '#ff4757', 'claude-sonnet-4-6', 'active', 'DEPLOY', 1, 1, 0, 1, 0, '["deploy","write_file","delete_file","run_command"]', 'prompt:BUILDER', '["write_file","delete_file","run_command","deploy"]'),
  ('ATLAS', 'atlas', 'ATLAS', 'Engineering Specialist', '#00d4ff', 'claude-sonnet-4-6', 'active', 'WRITE', 0, 1, 0, 0, 0, '["write_file"]', 'prompt:ATLAS', '["write_file"]'),
  ('HERALD', 'herald', 'HERALD', 'Content & Copy', '#2ed573', 'claude-sonnet-4-6', 'active', 'WRITE', 0, 1, 1, 0, 0, '["send_email","publish_content"]', 'prompt:HERALD', '["send_email","publish_content"]'),
  ('REEL', 'reel', 'REEL', 'Video & Animation', '#f5c842', 'claude-sonnet-4-6', 'active', 'WRITE', 0, 1, 0, 0, 0, '["write_file","render_video"]', 'prompt:REEL', '["write_file","render_video"]'),
  ('SENTINEL', 'sentinel', 'SENTINEL', 'QA Gate', '#ff4757', 'claude-sonnet-4-6', 'active', 'READ', 0, 0, 0, 0, 1, '[]', 'prompt:SENTINEL', '[]'),
  ('DISPATCH', 'dispatch', 'DISPATCH', 'Client Delivery', '#00d4ff', 'claude-sonnet-4-6', 'active', 'WRITE', 0, 1, 1, 0, 0, '["send_email","write_file"]', 'prompt:DISPATCH', '["write_file","send_email"]'),
  ('ANCHOR', 'anchor', 'ANCHOR', 'Revenue & MRR', '#2ed573', 'claude-sonnet-4-6', 'active', 'WRITE', 0, 1, 0, 0, 0, '["write_file"]', 'prompt:ANCHOR', '["write_file"]');
