/**
 * Sprint 18Y → 18Z — Tweaks Panel runtime engine.
 *
 * Four exports consumed by renderFullHtml() in pipeline.ts:
 *
 *   deriveDarkPalette()           — derives a sensible dark palette from light tokens
 *   generateAccentAlternates()    — produces 5 named accent alternates via HSL rotation
 *   buildTweaksPanelScript()      — returns a self-contained <script> IIFE to inject
 *                                   before </body> in the generated HTML
 *
 * The TweaksPanel is a fixed-position runtime toolbar (bottom-right corner) that:
 *   1. Toggles light/dark mode by adding/removing the 'dark' class on <html>
 *   2. Swaps the --accent CSS custom property from the generated accent alternates
 *   3. (Sprint 18Z) Lets the viewer send a feedback note back to the designer via
 *      POST /api/design/briefs/[id]/feedback
 *   4. Persists preferences to localStorage (graceful no-op in private mode)
 *
 * Only injected when the brief's skills array includes 'tweaks-panel'.
 * No npm dependencies — pure math + vanilla DOM, fully CF Workers compatible.
 */

import type { DesignTokens } from '@/types'

// ─────────────────────────────────────────────────────────────────────
// HEX ↔ HSL MATH
// ─────────────────────────────────────────────────────────────────────

function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, '').padEnd(6, '0').slice(0, 6)
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360
  const ss = Math.max(0, Math.min(100, s)) / 100
  const ll = Math.max(0, Math.min(100, l)) / 100
  const a = ss * Math.min(ll, 1 - ll)
  function f(n: number) {
    const k = (n + hh / 30) % 12
    const color = ll - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function isValidHex(hex: string): boolean {
  return /^#[0-9a-f]{3,6}$/i.test(hex)
}

function safeHex(hex: string, fallback: string): string {
  return isValidHex(hex) ? hex : fallback
}

// ─────────────────────────────────────────────────────────────────────
// DARK PALETTE DERIVATION
// ─────────────────────────────────────────────────────────────────────

export function deriveDarkPalette(
  light: DesignTokens['palette'],
): NonNullable<DesignTokens['palette_dark']> {
  const [ph, ps] = hexToHsl(safeHex(light.primary, '#4f46e5'))
  const [ah, as_] = hexToHsl(safeHex(light.accent, '#f59e0b'))

  // Keep hue + saturation, boost lightness so colour is readable on dark surfaces.
  // Saturated colours (s > 20) get a higher target lightness than desaturated ones.
  const darkPrimary = hslToHex(ph, ps, Math.min(70, Math.max(55, ps > 20 ? 62 : 55)))
  const darkAccent  = hslToHex(ah, as_, Math.min(65, Math.max(50, 58)))

  return {
    primary:        darkPrimary,
    accent:         darkAccent,
    background:     '#0f172a',
    surface:        '#1e293b',
    text_primary:   '#f1f5f9',
    text_secondary: '#94a3b8',
    border:         '#334155',
  }
}

// ─────────────────────────────────────────────────────────────────────
// ACCENT ALTERNATES (5 named swatches from the base accent colour)
// ─────────────────────────────────────────────────────────────────────

export function generateAccentAlternates(
  accentHex: string,
): Array<{ name: string; hex: string }> {
  const safe = safeHex(accentHex, '#f59e0b')
  const [h, s, l] = hexToHsl(safe)

  return [
    { name: 'Default',    hex: safe },
    { name: 'Complement', hex: hslToHex((h + 180) % 360, s, l) },
    { name: 'Warm',       hex: hslToHex((h - 30 + 360) % 360, Math.min(s + 10, 90), l) },
    { name: 'Cool',       hex: hslToHex((h + 30) % 360, Math.min(s + 5, 90), l) },
    { name: 'Mono',       hex: hslToHex(h, Math.max(s - 60, 0), l) },
  ]
}

// ─────────────────────────────────────────────────────────────────────
// TWEAKS PANEL — inline IIFE <script> injected before </body>
// ─────────────────────────────────────────────────────────────────────

export interface BuildTweaksPanelOptions {
  accentAlternates: Array<{ name: string; hex: string }>
  /** Sprint 18Z — POST target for the feedback endpoint. Pass null/empty to
   *  disable the feedback section (panel stays as Sprint 18Y v1). */
  feedbackApiUrl?: string | null
  /** Sprint 18Z — iteration_number to attach to the feedback row. */
  iterationNumber?: number | null
}

export function buildTweaksPanelScript(opts: BuildTweaksPanelOptions): string {
  const altJson = JSON.stringify(opts.accentAlternates)
  const feedbackUrl = opts.feedbackApiUrl ?? ''
  const iterNum = opts.iterationNumber ?? null
  const feedbackEnabled = Boolean(feedbackUrl)

  return `<script id="nexus-tweaks-panel">
(function() {
  'use strict';
  var ALT = ${altJson};
  var SK = 'nexus_design_tweaks';
  var FB_URL = ${JSON.stringify(feedbackUrl)};
  var FB_ITER = ${JSON.stringify(iterNum)};
  var FB_ON = ${JSON.stringify(feedbackEnabled)};
  function load() { try { return JSON.parse(localStorage.getItem(SK) || '{}'); } catch(e) { return {}; } }
  function save(p) { try { localStorage.setItem(SK, JSON.stringify(p)); } catch(e) {} }

  // Apply saved preferences before first paint to avoid flash
  var prefs = load();
  if (prefs.dark) document.documentElement.classList.add('dark');
  if (prefs.accent) {
    document.documentElement.style.setProperty('--accent', prefs.accent);
    document.documentElement.style.setProperty('--accent-color', prefs.accent);
  }

  function build() {
    var panel = document.createElement('div');
    panel.id = 'nexus-tweaks';
    panel.setAttribute('aria-label', 'Design tweaks');
    panel.setAttribute('role', 'toolbar');

    // Styles injected into <head> at build time so they are available
    // even before the panel DOM is created.
    var st = document.createElement('style');
    st.textContent =
      '#nexus-tweaks{position:fixed;bottom:20px;right:20px;z-index:9999;' +
      'background:rgba(255,255,255,0.92);backdrop-filter:blur(12px);' +
      '-webkit-backdrop-filter:blur(12px);border:1px solid rgba(0,0,0,0.12);' +
      'border-radius:12px;padding:10px 12px;' +
      'box-shadow:0 4px 24px rgba(0,0,0,0.12);display:flex;flex-direction:column;' +
      'gap:8px;min-width:148px;max-width:260px;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:11px;}' +
      '.dark #nexus-tweaks{background:rgba(30,41,59,0.92);border-color:rgba(255,255,255,0.1);}' +
      '#nxt-lbl{font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;' +
      'opacity:.45;color:inherit;}' +
      '.dark #nxt-lbl{color:#f1f5f9;}' +
      '#nxt-row{display:flex;align-items:center;gap:8px;}' +
      '#nxt-btn{background:none;border:1px solid rgba(0,0,0,0.18);border-radius:6px;' +
      'width:28px;height:22px;cursor:pointer;font-size:13px;display:flex;align-items:center;' +
      'justify-content:center;padding:0;}' +
      '.dark #nxt-btn{border-color:rgba(255,255,255,0.22);}' +
      '#nxt-btn:hover{background:rgba(0,0,0,0.06);}' +
      '.dark #nxt-btn:hover{background:rgba(255,255,255,0.08);}' +
      '#nxt-ml{opacity:.55;font-size:11px;color:inherit;}' +
      '.dark #nxt-ml{color:#f1f5f9;}' +
      '#nxt-al{font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;' +
      'opacity:.45;color:inherit;}' +
      '.dark #nxt-al{color:#f1f5f9;}' +
      '#nxt-sw{display:flex;gap:4px;flex-wrap:wrap;}' +
      '.nxsw{width:16px;height:16px;border-radius:50%;cursor:pointer;' +
      'border:2px solid transparent;transition:transform .12s;flex-shrink:0;padding:0;}' +
      '.nxsw:hover{transform:scale(1.28);}' +
      '.nxsw.on{border-color:rgba(0,0,0,0.45);}' +
      '.dark .nxsw.on{border-color:rgba(255,255,255,0.65);}' +
      // Sprint 18Z — feedback section
      '#nxt-fb-lbl{font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;' +
      'opacity:.45;color:inherit;margin-top:4px;}' +
      '.dark #nxt-fb-lbl{color:#f1f5f9;}' +
      '#nxt-fb-ta{width:100%;min-height:54px;max-height:160px;resize:vertical;' +
      'border:1px solid rgba(0,0,0,0.18);border-radius:6px;padding:6px 8px;' +
      'font-family:inherit;font-size:11px;color:inherit;background:rgba(255,255,255,0.5);' +
      'box-sizing:border-box;}' +
      '.dark #nxt-fb-ta{background:rgba(0,0,0,0.25);border-color:rgba(255,255,255,0.18);color:#f1f5f9;}' +
      '#nxt-fb-ta:focus{outline:1px solid rgba(0,0,0,0.4);outline-offset:0;}' +
      '.dark #nxt-fb-ta:focus{outline-color:rgba(255,255,255,0.5);}' +
      '#nxt-fb-row{display:flex;align-items:center;gap:6px;justify-content:space-between;}' +
      '#nxt-fb-send{background:var(--primary, #4f46e5);color:#fff;border:none;border-radius:6px;' +
      'padding:5px 10px;font-size:10.5px;font-weight:600;cursor:pointer;letter-spacing:.02em;' +
      'transition:opacity .15s;font-family:inherit;}' +
      '#nxt-fb-send:hover:not(:disabled){opacity:.88;}' +
      '#nxt-fb-send:disabled{opacity:.4;cursor:not-allowed;}' +
      '#nxt-fb-status{font-size:10px;opacity:.55;color:inherit;flex:1;text-align:right;}' +
      '.dark #nxt-fb-status{color:#f1f5f9;}' +
      '#nxt-fb-status.ok{color:#059669;opacity:.95;}' +
      '#nxt-fb-status.err{color:#dc2626;opacity:.95;}' +
      '.dark #nxt-fb-status.ok{color:#34d399;}' +
      '.dark #nxt-fb-status.err{color:#f87171;}' +
      // Reset
      '#nxt-rst{background:none;border:none;font-size:10px;color:rgba(0,0,0,0.38);' +
      'cursor:pointer;padding:0;text-align:left;}' +
      '.dark #nxt-rst{color:rgba(255,255,255,0.35);}' +
      '#nxt-rst:hover{color:rgba(0,0,0,0.72);}' +
      '.dark #nxt-rst:hover{color:rgba(255,255,255,0.72);}'
    document.head.appendChild(st);

    var lbl = document.createElement('div');
    lbl.id = 'nxt-lbl';
    lbl.textContent = 'Tweaks';
    panel.appendChild(lbl);

    // ── Dark mode row ──
    var row = document.createElement('div');
    row.id = 'nxt-row';
    var isDark = document.documentElement.classList.contains('dark');
    var btn = document.createElement('button');
    btn.id = 'nxt-btn';
    btn.title = 'Toggle light / dark mode';
    btn.textContent = isDark ? '\u2600\ufe0f' : '\uD83C\uDF19';
    btn.onclick = function() {
      var d = document.documentElement.classList.toggle('dark');
      btn.textContent = d ? '\u2600\ufe0f' : '\uD83C\uDF19';
      var p = load(); p.dark = d; save(p);
    };
    row.appendChild(btn);
    var ml = document.createElement('span');
    ml.id = 'nxt-ml';
    ml.textContent = 'Light / dark';
    row.appendChild(ml);
    panel.appendChild(row);

    // ── Accent swatches (only when there are multiple alternates) ──
    var swCon = null;
    if (ALT && ALT.length > 1) {
      var al = document.createElement('div');
      al.id = 'nxt-al';
      al.textContent = 'Accent';
      panel.appendChild(al);
      swCon = document.createElement('div');
      swCon.id = 'nxt-sw';
      var activeHex = prefs.accent || ALT[0].hex;
      ALT.forEach(function(a) {
        var sw = document.createElement('button');
        sw.className = 'nxsw' + (a.hex === activeHex ? ' on' : '');
        sw.style.background = a.hex;
        sw.title = a.name;
        sw.setAttribute('aria-label', 'Accent: ' + a.name);
        sw.onclick = function() {
          document.documentElement.style.setProperty('--accent', a.hex);
          document.documentElement.style.setProperty('--accent-color', a.hex);
          swCon.querySelectorAll('.nxsw').forEach(function(x) { x.classList.remove('on'); });
          sw.classList.add('on');
          var p = load(); p.accent = a.hex; save(p);
        };
        swCon.appendChild(sw);
      });
      panel.appendChild(swCon);
    }

    // ── Sprint 18Z — Feedback section ──
    if (FB_ON) {
      var fbLbl = document.createElement('div');
      fbLbl.id = 'nxt-fb-lbl';
      fbLbl.textContent = 'Send notes to designer';
      panel.appendChild(fbLbl);

      var ta = document.createElement('textarea');
      ta.id = 'nxt-fb-ta';
      ta.placeholder = "What's working? What's not? Anything to tweak…";
      ta.maxLength = 2000;
      panel.appendChild(ta);

      var fbRow = document.createElement('div');
      fbRow.id = 'nxt-fb-row';
      var send = document.createElement('button');
      send.id = 'nxt-fb-send';
      send.textContent = 'Send';
      send.type = 'button';
      var status = document.createElement('span');
      status.id = 'nxt-fb-status';
      status.textContent = '';
      fbRow.appendChild(send);
      fbRow.appendChild(status);
      panel.appendChild(fbRow);

      send.onclick = function() {
        var notes = (ta.value || '').trim();
        if (!notes) {
          status.className = 'err';
          status.textContent = 'Type a note first';
          return;
        }
        send.disabled = true;
        status.className = '';
        status.textContent = 'Sending…';
        var payload = { notes: notes };
        if (FB_ITER !== null) payload.iteration_number = FB_ITER;
        fetch(FB_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(function(r) {
          if (r.ok) {
            ta.value = '';
            status.className = 'ok';
            status.textContent = 'Sent ✓';
            setTimeout(function() { status.textContent = ''; status.className = ''; }, 4000);
          } else {
            return r.json().then(function(j) {
              status.className = 'err';
              status.textContent = (j && j.error) ? j.error : ('Error ' + r.status);
            }).catch(function() {
              status.className = 'err';
              status.textContent = 'Error ' + r.status;
            });
          }
        }).catch(function() {
          status.className = 'err';
          status.textContent = 'Network error';
        }).then(function() {
          send.disabled = false;
        });
      };
    }

    // ── Reset button ──
    var rst = document.createElement('button');
    rst.id = 'nxt-rst';
    rst.textContent = '\u21ba Reset';
    rst.title = 'Reset to design defaults';
    rst.onclick = function() {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.removeProperty('--accent');
      document.documentElement.style.removeProperty('--accent-color');
      btn.textContent = '\uD83C\uDF19';
      if (swCon) {
        swCon.querySelectorAll('.nxsw').forEach(function(x, i) {
          x.classList.toggle('on', i === 0);
        });
      }
      try { localStorage.removeItem(SK); } catch(e) {}
    };
    panel.appendChild(rst);

    document.body.appendChild(panel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
<\/script>`
}
