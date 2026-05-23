export function slugFromTitle(title: string): { name: string; slug: string } {
  const match = title.match(/Compose\s+(.+?)\s+section/i)
  const name = match
    ? match[1]
    : title.replace(/^Compose\s+/i, '').replace(/\s+section$/i, '')
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return { name, slug }
}
