export interface RunnerSection { title: string; color: string }

export function parseSections(full: string, sectionTitles: string[]): { title: string; body: string }[] {
  const result: { title: string; body: string }[] = []
  for (let i = 0; i < sectionTitles.length; i++) {
    const start = full.indexOf(`## ${sectionTitles[i]}`)
    if (start === -1) continue
    const contentStart = start + `## ${sectionTitles[i]}`.length
    const nextStarts = sectionTitles.slice(i + 1)
      .map(s => full.indexOf(`## ${s}`))
      .filter(idx => idx > start)
    const end = nextStarts.length ? Math.min(...nextStarts) : full.length
    result.push({ title: sectionTitles[i], body: full.slice(contentStart, end).trim() })
  }
  return result
}
