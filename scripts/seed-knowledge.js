#!/usr/bin/env node
// NEXUS Knowledge Base Seeder — May 7-8 2026 Sessions
// Run: node scripts/seed-knowledge.js

const BASE_URL = 'https://ll-cockpit.connorpattern.workers.dev';

async function post(type, data) {
  const res = await fetch(`${BASE_URL}/api/knowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, data }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Failed: ${JSON.stringify(json)}`);
  return json;
}

async function seed(label, type, data) {
  try {
    const result = await post(type, data);
    console.log(`✅ ${label} → ${result.id}`);
  } catch (err) {
    console.error(`❌ ${label} → ${err.message}`);
  }
}

async function main() {
  console.log('\n🧠 NEXUS Knowledge Base Seeder — May 7-8 2026\n');

  // ─── MAY 8 SESSION NODES ───

  await seed('May8: R2 API routes live', 'study_node', {
    title: 'R2 API Routes — All 7 Live and Verified',
    category: 'architecture',
    content: 'Seven R2 and AI API routes deployed and verified via PowerShell. GET /api/r2/list?prefix= returns objects from ll-cockpit-r2 (binding: env.R2). GET /api/r2/text?key= reads text files with extension validation (binary guard blocks .zip/.png etc, returns 415). GET /api/r2/object/[...key] streams raw objects with correct Content-Type. GET /api/ai/providers checks which AI secrets are deployed (Anthropic confirmed active, OpenAI/Gemini not yet). POST /api/agent/code uses native fetch to Anthropic NOT SDK (SDK incompatible with CF Workers). GET /api/github/status checks GitHub OAuth secrets. GET /api/health now checks d1+kv+r2+supabase+anthropic+workers_ai — all returning ok. Current R2 bucket (ll-cockpit-r2) has 1 object: ll_project_knowledge.zip (153KB, binary). All routes use getCloudflareContext() pattern.',
    tags: 'r2,api-routes,monaco,ide,health-check,anthropic,cloudflare',
    source: 'session_log_may8'
  });

  await seed('May8: D1 migrations 0004-0007 complete', 'study_node', {
    title: 'D1 Migrations 0004-0007 — 34 Tables Now Live',
    category: 'architecture',
    content: 'Ran migrations directly via Cloudflare MCP D1 query tool. No Claude Code needed. New tables: cms_ai_providers (seeded: anthropic active, openai/gemini needs_secret, workers_ai active), cms_ai_models (seeded: haiku/sonnet/opus lanes + BGE embeddings), cms_ai_routing_policy (seeded: default routing sonnet as default_workhorse, haiku as cheap_fast_router, opus as senior_reasoning), cms_r2_buckets (seeded: ll-cockpit-r2 binding), cms_r2_objects, analytics_events, ai_completions, content_queue, subscribers, revenue, pending_approvals. Total D1 tables: 34. Note: research pipeline tables (migration 0008) not yet run — planned for Sprint 6 with ORACLE pipeline.',
    tags: 'd1,migrations,cms-ai-providers,routing-policy,tables,cloudflare-mcp',
    source: 'session_log_may8'
  });

  await seed('May8: CMS design system — design tokens + DesignProvider', 'study_node', {
    title: 'CMS Design Token System — Full Granular Control',
    category: 'architecture',
    content: 'Built complete design token system in 4 files. src/lib/design-tokens.ts: types (GradientLayer, GradientStop, ShadowLayer, DesignTokens) + utility functions (hexToRgb, hexAlpha, lighten, darken, buildGradientCSS, buildShadowCSS). src/stores/designStore.ts: Zustand store with all CRUD actions for gradient layers/stops, shadow layers, persisted to localStorage as ll-design-v1. src/components/theme/DesignProvider.tsx: replaces ThemeProvider, applies 12 systems to CSS: background, gradient layers, accent colors, semantic colors, text, surfaces, glass, border radius scale, shadows, glow, status bar, motion, typography. src/app/layout.tsx: uses DesignProvider instead of ThemeProvider. 6 granular controls: backdrop blur, glass opacity, border opacity, shadow depth, gradient intensity, inner highlight toggle. All applied via CSS custom properties on document.documentElement.',
    tags: 'design-tokens,design-provider,glassmorphic,css-variables,zustand,gradient',
    source: 'session_log_may8'
  });

  await seed('May8: 10 themes dark teal default', 'study_node', {
    title: 'Theme System — 10 Themes, Dark Teal Default',
    category: 'architecture',
    content: 'themes.ts rebuilt with 10 themes. DEFAULT_THEME_ID = teal. Dark themes: Teal Pro (#070e0b base, #00c9a7 accent — matches Sam Primeaux inneranimalmedia.com production app), Ocean (#060b14, #3b82f6), Noir (#080808, #818cf8), Synthwave (#0a0010, #e879f9). Light themes: Pearl (#f8faff, #3b82f6), Aurora (#faf5ff, #8b5cf6), Sunset (#fff8f2, #f97316), Bloom (#fff0f5, #f43f5e), Forest (#f2fdf7, #10b981), Sky (#f0f9ff, #38bdf8). Each theme has full CSS variable set: --t-body, --t-g1/g2 (gradient colors), --t-p/p-dim/p-bright/p-glow/p-glass, --t-s, --t-tx1/2/3, --t-bdr/bdr-s, --t-sb-bg/tx, --t-blur. ThemeProvider upgraded to DesignProvider which applies both theme vars AND design overrides.',
    tags: 'themes,teal,dark-mode,light-mode,css-variables,design-system',
    source: 'session_log_may8'
  });

  await seed('May8: Browser page with iframe', 'study_node', {
    title: 'Browser Page — Embedded Browser at /browser',
    category: 'codebase',
    content: 'Created src/app/(cockpit)/browser/page.tsx. Full embedded browser with: traffic lights (ff5f57/febc2e/28c840), back/forward buttons with history stack, refresh button, URL bar with navigation on Enter, bookmarks bar (LL Cockpit, Cloudflare, Supabase, GitHub, Anthropic, Linear), loading progress indicator (animated gradient bar), iframe with sandbox allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation. History managed via useState array + index. Added browser.tsx tab to TabBar between ide.tsx and terminal.tsx. Note: many sites block iframe embedding via X-Frame-Options — works for our own Workers URL and some others.',
    tags: 'browser,iframe,tab-bar,navigation,bookmarks',
    source: 'session_log_may8'
  });

  await seed('May8: Settings CMS full sidebar nav', 'study_node', {
    title: 'Settings Page — Full CMS Control Panel with Sidebar Nav',
    category: 'codebase',
    content: 'Rebuilt settings/page.tsx as a full CMS design control panel. Left sidebar: user card (CM Pro Plan), filter input, Appearance section (Themes, Background, Colors, Surfaces, Glass & Blur, Borders & Radius, Shadows, Glow & Ambient, Typography, Motion, Export Theme), Integrations section (AI Models, Tools & MCP, GitHub, Storage, Security, General). Reset to defaults button. Right content: 11 design sections each with professional controls. AI Models section matches Sam Primeaux inneranimalmedia.com settings exactly: provider groups (Anthropic/OpenAI/Gemini/Workers AI), status dots, capability badges (Tools/Vision/Embed), size badges (small/medium/large). Gradient layer builder: per-layer type selector (radial/linear/conic), per-stop color picker + alpha + position, gradient preview bar. Shadow layer builder: x/y/blur/spread/color/alpha/inset controls. Export: copies CSS vars or JSON tokens to clipboard. TypeScript fix: Label component accepts optional className prop.',
    tags: 'settings,cms,sidebar-nav,ai-models,design-panel,gradient-builder,shadow-builder',
    source: 'session_log_may8'
  });

  await seed('May8: Cursor IDE chrome TabBar + TopBar + StatusBar', 'study_node', {
    title: 'Cursor-Style IDE Chrome — TabBar, TopBar, StatusBar',
    category: 'codebase',
    content: 'TabBar (src/components/layout/TabBar.tsx): 35px file tabs at top of editor area. Tabs: dashboard.tsx, ide.tsx, browser.tsx, terminal.tsx, pipeline.tsx, agents.tsx, storage.tsx, analytics.tsx. Active tab: blue top accent line + lighter background. Hover shows X close button. TopBar (src/components/layout/TopBar.tsx): 38px, glass panel, LL logo + LL COCKPIT gold text, workspace badge with green dot, centered search bar that opens command palette, cost meter, settings gear. StatusBar (src/components/layout/StatusBar.tsx): 22px, uses --t-sb-bg/tx CSS vars (themed per active theme), git branch icon + main, NEXUS PRIME, claude-sonnet-4-5, UTF-8, TypeScript. ActivityRail (src/components/layout/ActivityRail.tsx): 48px left strip, LL logo mark, 7 nav icons with active glow state, tooltips on hover, settings pinned at bottom. All components use CSS variables so they respond to theme changes instantly.',
    tags: 'tab-bar,top-bar,status-bar,activity-rail,cursor,ide,css-variables',
    source: 'session_log_may8'
  });

  await seed('May8: Claude Code hallucination pattern — branch push never happened', 'study_node', {
    title: 'Failure Pattern — Claude Code Hallucinating Successful Git Push',
    category: 'failure_pattern',
    content: 'Occurred twice this session. Claude Code reports all commits pushed and branch created. Running git branch -a or checking GitHub shows no branch exists. Root cause: Claude Code generates a successful-looking report but the git push either failed silently or was never executed. Diagnostic: always check github.com/{repo}/branches or run git fetch --all && git branch -r after Claude Code claims to push. Fix: use GitHub MCP push_files tool from Claude Chat to push directly via GitHub API — guaranteed to land. This is more reliable than trusting Claude Code git operations. Pattern name: Hallucination (from build_failure_modes.md). Applied in this session: pushed all major file sets directly via GitHub MCP instead of Claude Code git commands.',
    tags: 'claude-code,hallucination,git-push,github-mcp,failure-pattern',
    source: 'session_log_may8'
  });

  await seed('May8: Sprint 5 status update', 'sprint_item', {
    id: 'sprint-5-status-may8',
    sprint_number: 5,
    title: 'Sprint 5 Status as of May 8 2026',
    description: 'DONE: 5A resizable panels (useResizablePanels hook with beginDrag pattern). 5B R2 API routes (all 7 live, verified via PowerShell). 5D D1 migrations 0004-0007 (34 tables, seeded with AI providers/models/routing). DONE (bonus): Browser page /browser, CMS design token system, 10 themes dark teal default, Settings full CMS panel, Cursor IDE chrome. TODO: 5C Monaco IDE wiring (R2 file tree, tab system, language detection, agent-to-editor apply). TODO: 5E new standalone pages (/ai-providers, /storage, /analytics, /leads). TODO: Sprint 4 gaps (Supabase auth verified, D1 message persistence confirmed, PermissionGate).',
    status: 'in_progress',
    priority: 1,
    agent: 'BUILDER',
    category: 'sprint'
  });

  console.log('\n✅ Seeding complete. Embeddings queuing in background.');
  console.log('Next: node scripts/seed-knowledge.js');
}

main().catch(console.error);
