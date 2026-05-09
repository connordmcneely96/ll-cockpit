#!/usr/bin/env node
// Seed actual code files into ll-cockpit-r2 so Monaco IDE has something to show
// Run: node scripts/seed-r2.js

import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const BUCKET = 'll-cockpit-r2'

const FILES = [
  { key: 'src/lib/agents.ts',                    local: 'src/lib/agents.ts' },
  { key: 'src/lib/design-tokens.ts',             local: 'src/lib/design-tokens.ts' },
  { key: 'src/stores/ideStore.ts',               local: 'src/stores/ideStore.ts' },
  { key: 'src/stores/designStore.ts',            local: 'src/stores/designStore.ts' },
  { key: 'src/app/api/health/route.ts',          local: 'src/app/api/health/route.ts' },
  { key: 'src/app/api/r2/list/route.ts',         local: 'src/app/api/r2/list/route.ts' },
  { key: 'src/app/(cockpit)/ide/page.tsx',       local: 'src/app/(cockpit)/ide/page.tsx' },
  { key: 'src/app/(cockpit)/ide/FileTree.tsx',   local: 'src/app/(cockpit)/ide/FileTree.tsx' },
  { key: 'src/app/(cockpit)/ide/CodeEditor.tsx', local: 'src/app/(cockpit)/ide/CodeEditor.tsx' },
  { key: 'src/app/(cockpit)/ide/IdeTabBar.tsx',  local: 'src/app/(cockpit)/ide/IdeTabBar.tsx' },
  { key: 'src/components/layout/ActivityRail.tsx', local: 'src/components/layout/ActivityRail.tsx' },
  { key: 'src/components/layout/ExplorerPanel.tsx', local: 'src/components/layout/ExplorerPanel.tsx' },
  { key: 'src/components/theme/DesignProvider.tsx', local: 'src/components/theme/DesignProvider.tsx' },
  { key: 'wrangler.toml',                        local: 'wrangler.toml' },
  { key: 'package.json',                        local: 'package.json' },
  { key: 'tailwind.config.ts',                  local: 'tailwind.config.ts' },
]

console.log('\n🪟 Seeding ll-cockpit-r2 (REMOTE) with code files for Monaco IDE\n')

let uploaded = 0
let failed = 0

for (const { key, local } of FILES) {
  const localPath = join(process.cwd(), local)
  if (!existsSync(localPath)) {
    console.log(`⚠️  SKIP  ${key} (not found locally)`)
    failed++
    continue
  }

  try {
    // --remote is required to upload to the actual Cloudflare R2 bucket
    execSync(
      `wrangler r2 object put ${BUCKET}/${key} --file=${localPath} --content-type=text/plain --remote`,
      { stdio: 'pipe' }
    )
    const size = readFileSync(localPath).length
    console.log(`✅  ${key} (${(size/1024).toFixed(1)}KB)`)
    uploaded++
  } catch (err) {
    console.error(`❌  ${key}: ${err.message}`)
    failed++
  }
}

console.log(`\n─────────────────────────`)
console.log(`✅ Uploaded: ${uploaded}`)
console.log(`❌ Failed:   ${failed}`)
console.log(`\nVerify: wrangler r2 object get ${BUCKET}/wrangler.toml --file=./check.toml --remote`)
console.log(`Then: /api/r2/list should return ${uploaded + 1} objects (+1 for the existing zip)`)
