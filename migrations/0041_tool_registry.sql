-- 0041_tool_registry.sql
-- Sprint 46 (reframed in-lib) · Agent tool-execution layer foundation.
-- Creates the tool_registry CATALOG and seeds the Phase-1 tool list.
-- IMPORTANT: the registry is a catalog only. Listing a tool here does NOT make
-- it callable — the in-lib tool dispatcher controls which tools are actually
-- executable, starting with a safe read-only allowlist. Additive; no DROP.
CREATE TABLE IF NOT EXISTS tool_registry (
  tool_key TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  endpoint TEXT,
  auth_type TEXT,
  agent_owner TEXT,
  in_house_replacement TEXT,
  phase INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  config_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_tool_registry_active ON tool_registry(active);
CREATE INDEX IF NOT EXISTS idx_tool_registry_owner ON tool_registry(agent_owner);

INSERT OR REPLACE INTO tool_registry
(tool_key, tool_name, endpoint, auth_type, agent_owner, in_house_replacement, phase, active) VALUES
('web_search', 'SearXNG', 'https://searx.leadershiplegacydigital.com/search', 'none', 'SCOUT,ORACLE', 'self', 1, 1),
('firecrawl', 'Firecrawl Scrape', 'https://api.firecrawl.dev/v1/scrape', 'bearer', 'SCOUT', 'cf_browser_render', 1, 1),
('genspark', 'Genspark', 'https://api.genspark.ai/v1', 'bearer', 'ORACLE', 'oracle_searxng', 2, 0),
('grok', 'Grok via OpenRouter', 'https://openrouter.ai/api/v1', 'bearer', 'ORACLE', 'none', 1, 1),
('telegram_send', 'Telegram Bot API', 'https://api.telegram.org', 'bot_token', 'NEXUS', 'self', 1, 1),
('discord_send', 'Discord Bot', 'https://discord.com/api/v10', 'bot_token', 'HERALD', 'self', 2, 0),
('gmail_send', 'Gmail MCP', 'mcp://gmail', 'oauth', 'DISPATCH,SCOUT', 'self', 1, 1),
('openclaw_outreach', 'OpenClaw API', 'https://api.openclaw.com', 'bearer', 'SCOUT', 'self', 1, 1),
('apollo_search', 'Apollo.io', 'https://api.apollo.io/v1', 'api_key', 'SCOUT', 'permanent', 1, 1),
('github_commit', 'GitHub API', 'https://api.github.com', 'bearer', 'FORGE,BUILDER', 'self', 1, 1),
('github_create_repo', 'GitHub Create Repo', 'https://api.github.com/user/repos', 'bearer', 'BUILDER', 'self', 1, 1),
('cf_pages_deploy', 'Cloudflare Pages Deploy', 'https://api.cloudflare.com', 'bearer', 'BUILDER', 'self', 1, 1),
('cf_d1_query', 'Cloudflare D1', 'binding:DB', 'binding', 'all', 'self', 1, 1),
('cf_r2_upload', 'Cloudflare R2', 'binding:R2', 'binding', 'all', 'self', 1, 1),
('cf_browser_render', 'CF Browser Rendering', 'binding:BROWSER', 'binding', 'BUILDER', 'self', 1, 1),
('cf_vectorize', 'Cloudflare Vectorize', 'binding:MEMORY', 'binding', 'ATLAS,ORACLE', 'self', 1, 1),
('openrouter_llm', 'OpenRouter Multi-Model', 'https://openrouter.ai/api/v1', 'bearer', 'all', 'multi-provider', 1, 1),
('anthropic_claude', 'Claude API', 'https://api.anthropic.com/v1', 'api_key', 'all', 'permanent', 1, 1),
('notion_update', 'Notion MCP', 'mcp://notion', 'oauth', 'INTAKE,DISPATCH', 'd1_native', 1, 1),
('calendar_create', 'Google Calendar MCP', 'mcp://gcal', 'oauth', 'INTAKE', 'permanent', 1, 1),
('drive_upload', 'Google Drive MCP', 'mcp://gdrive', 'oauth', 'DISPATCH,ATLAS', 'partial', 1, 1),
('ghl_crm', 'GoHighLevel CRM', 'https://services.leadconnectorhq.com', 'bearer', 'INTAKE,SCOUT', 'd1_crm', 1, 1),
('stripe_invoice', 'Stripe API', 'https://api.stripe.com/v1', 'bearer', 'ANCHOR', 'permanent', 1, 1),
('youtube_data', 'YouTube Data API v3', 'https://www.googleapis.com/youtube/v3', 'api_key', 'ORACLE', 'permanent', 1, 1),
('youtube_transcript', 'VPS Transcript Scraper', 'https://terminal.leadershiplegacydigital.com:3002', 'shared_secret', 'ORACLE', 'self', 1, 1),
('rss_fetch', 'RSS Parser', 'binding:fetch', 'none', 'ORACLE', 'self', 1, 1),
('x_scraper', 'X/Twitter Scraper', 'https://terminal.leadershiplegacydigital.com:3003', 'shared_secret', 'ORACLE', 'self', 1, 1),
('veo3_generate', 'Veo 3 (Google)', 'https://generativelanguage.googleapis.com/v1', 'api_key', 'REEL', 'finetune_phase4', 2, 0),
('invideo_generate', 'InVideo AI', 'https://api.invideo.io/v1', 'bearer', 'REEL', 'permanent', 2, 0),
('canva_create', 'Canva MCP', 'mcp://canva', 'oauth', 'HERALD,REEL', 'claude_design', 1, 1),
('cf_workers_ai_image', 'CF Workers AI (Flux)', 'binding:AI', 'binding', 'REEL,HERALD', 'self', 1, 1);
