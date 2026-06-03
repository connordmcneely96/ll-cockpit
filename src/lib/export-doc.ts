interface BuildExportOpts {
  title: string
  subtitle: string
  sections: { title: string; body: string }[]
  meta?: { generatedAt: string }
}

const ESCAPE_MAP: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;' }
const escapeHtml = (s: string) => s.replace(/[<>&]/g, c => ESCAPE_MAP[c])
const escapeAttr = (s: string) => s.replace(/[<>&"']/g, c => ({ ...ESCAPE_MAP, '"': '&quot;', "'": '&#39;' }[c]!))

export function buildExportHtml(opts: BuildExportOpts): string {
  const generated = opts.meta?.generatedAt ?? new Date().toISOString().slice(0, 10)
  const sectionsJson = JSON.stringify(opts.sections.map(s => ({ title: s.title, body: s.body })))
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(opts.title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; background: #ffffff; max-width: 780px; margin: 2.5rem auto; padding: 0 2rem; line-height: 1.55; }
  header { border-bottom: 2px solid #1a1a1a; padding-bottom: 1rem; margin-bottom: 2rem; }
  header h1 { font-size: 1.75rem; margin: 0 0 0.25rem; letter-spacing: -0.01em; }
  header .subtitle { color: #555; font-style: italic; font-size: 1rem; }
  header .meta { color: #777; font-size: 0.8rem; margin-top: 0.5rem; font-family: -apple-system, system-ui, sans-serif; }
  section { margin-bottom: 2rem; page-break-inside: avoid; }
  section h2 { font-size: 1.15rem; margin: 0 0 0.5rem; padding-bottom: 0.25rem; border-bottom: 1px solid #ccc; font-family: -apple-system, system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.05em; color: #333; }
  section .body { font-size: 0.95rem; }
  section .body p { margin: 0.5rem 0; }
  section .body ul, section .body ol { margin: 0.5rem 0 0.5rem 1.5rem; }
  section .body table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 0.9rem; }
  section .body th, section .body td { border: 1px solid #999; padding: 0.4rem 0.6rem; text-align: left; }
  section .body th { background: #f0f0f0; }
  section .body code { background: #f4f4f4; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
  section .body pre { background: #f4f4f4; padding: 0.75rem; border-radius: 4px; overflow-x: auto; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #ccc; color: #777; font-size: 0.8rem; font-family: -apple-system, system-ui, sans-serif; text-align: center; }
  @media print {
    body { margin: 0; padding: 1.5cm; max-width: none; }
    header { page-break-after: avoid; }
    section h2 { page-break-after: avoid; }
  }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(opts.title)}</h1>
  ${opts.subtitle ? `<div class="subtitle">${escapeHtml(opts.subtitle)}</div>` : ''}
  <div class="meta">Generated ${escapeAttr(generated)} · Leadership Legacy Digital</div>
</header>
<main id="content"></main>
<footer>Leadership Legacy Digital — Engineering Intelligence · ${escapeAttr(generated)}</footer>
<script id="sections-data" type="application/json">${sectionsJson.replace(/</g, '\\u003c')}</script>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
<script>
  (function () {
    var data = JSON.parse(document.getElementById('sections-data').textContent);
    var main = document.getElementById('content');
    data.forEach(function (s) {
      var sec = document.createElement('section');
      var h2 = document.createElement('h2'); h2.textContent = s.title; sec.appendChild(h2);
      var body = document.createElement('div'); body.className = 'body';
      body.innerHTML = window.marked ? window.marked.parse(s.body) : s.body.replace(/\\n/g, '<br>');
      sec.appendChild(body); main.appendChild(sec);
    });
    if (window.renderMathInElement) {
      window.renderMathInElement(document.body, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
        ],
        throwOnError: false,
      });
    }
  })();
</script>
</body>
</html>`
}

export function downloadHtml(filename: string, html: string): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
