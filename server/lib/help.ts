// Help pages for the people who run the church office. The pages are Markdown
// files in server/assets/help, bundled into the build (the runtime image has no
// source tree), and each one names the permission needed to read it, so nobody
// is shown instructions for work they cannot do. Nothing here is public.
import { marked } from 'marked'
import type { HelpSection, HelpSearchHit, HelpTopic, HelpTopicPage } from '../../shared/help.ts'
import { HELP_AREAS, type HelpArea } from '../../shared/help.ts'
import type { Permissions } from '../utils/auth.ts'

interface ParsedTopic extends HelpTopic {
  // What the viewer must be allowed to do, e.g. { giving: ['view'] }.
  permission: Permissions
  markdown: string
  text: string
  sections: HelpSection[]
  html: string
}

// `key: value` lines, and `key: [a, b]` lists. Quotes optional.
const parseFrontmatter = (raw: string) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (!match) throw new Error('A help page must start with a --- front matter block')
  const fields: Record<string, string | string[]> = {}
  for (const line of match[1]!.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const at = line.indexOf(':')
    if (at === -1) throw new Error(`Front matter line is not \`key: value\`: ${line}`)
    const key = line.slice(0, at).trim()
    const value = line.slice(at + 1).trim().replace(/^["']|["']$/g, '')
    fields[key] = value.startsWith('[')
      ? value.slice(1, -1).split(',').map(part => part.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      : value
  }
  return { fields, body: match[2]! }
}

const one = (fields: Record<string, string | string[]>, key: string, slug: string) => {
  const value = fields[key]
  if (typeof value !== 'string' || !value) throw new Error(`Help page ${slug} needs a \`${key}\``)
  return value
}

// "giving:view, stewardship:manage" -> { giving: ['view'], stewardship: ['manage'] }
const parsePermission = (value: string, slug: string): Permissions => {
  const permission: Record<string, string[]> = {}
  for (const part of value.split(',').map(p => p.trim()).filter(Boolean)) {
    const [resource, action] = part.split(':').map(p => p.trim())
    if (!resource || !action) throw new Error(`Help page ${slug} has a bad permission: ${part}`)
    ;(permission[resource] ??= []).push(action)
  }
  if (!Object.keys(permission).length) throw new Error(`Help page ${slug} needs a \`permission\``)
  return permission as Permissions
}

export const slugify = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Renders the body, giving every heading an id to link to and collecting the
// contents list shown beside the page.
const render = (markdown: string) => {
  const sections: HelpSection[] = []
  const renderer = new marked.Renderer()
  renderer.heading = function ({ tokens, depth }) {
    const label = this.parser.parseInline(tokens)
    const plain = label.replace(/<[^>]+>/g, '')
    const id = slugify(plain)
    if (depth === 2 || depth === 3) sections.push({ id, label: plain, depth })
    return `<h${depth} id="${id}">${label}</h${depth}>\n`
  }
  const html = marked.parse(markdown, { renderer, async: false })
  return { html, sections }
}

export const parseTopic = (slug: string, raw: string): ParsedTopic => {
  const { fields, body } = parseFrontmatter(raw)
  const area = one(fields, 'area', slug) as HelpArea
  if (!HELP_AREAS.includes(area)) {
    throw new Error(`Help page ${slug} has an unknown area: ${area}. Add it to HELP_AREAS.`)
  }
  const { html, sections } = render(body)
  const keywords = fields.keywords
  return {
    slug,
    title: one(fields, 'title', slug),
    summary: one(fields, 'summary', slug),
    area,
    order: Number(fields.order ?? 100),
    keywords: Array.isArray(keywords) ? keywords : keywords ? [keywords] : [],
    permission: parsePermission(one(fields, 'permission', slug), slug),
    markdown: body,
    // Plain text for searching, and for the snippet under a result: a link
    // keeps its words and loses its address, and no markup character is left
    // sitting in the middle of a sentence.
    text: body
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // A heading ends a sentence, so a snippet does not run the heading into
      // the paragraph under it.
      .replace(/^#{1,6}\s*(.+?)\s*$/gm, '$1.')
      .replace(/[#*_`>|]/g, '')
      .replace(/^\s*[-+]\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim(),
    sections,
    html,
  }
}

let cache: ParsedTopic[] | null = null

// Parsed once in production. In development every request re-reads the files, so
// editing a page shows up on reload. A bad page fails loudly here rather than
// showing a blank screen.
export const loadTopics = async (): Promise<ParsedTopic[]> => {
  if (cache && !import.meta.dev) return cache
  const storage = useStorage('assets:server')
  const keys = (await storage.getKeys('help')).filter(key => key.endsWith('.md'))
  const topics = await Promise.all(keys.map(async (key) => {
    const raw = await storage.getItem<string>(key)
    const slug = key.replace(/^help:/, '').replace(/\.md$/, '')
    return parseTopic(slug, typeof raw === 'string' ? raw : String(raw))
  }))
  cache = topics.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  return cache
}

// Only topics this person is allowed to read.
export const readableTopics = async (userId: string) => {
  const topics = await loadTopics()
  const allowed = await Promise.all(topics.map(topic => hasPermission(userId, topic.permission)))
  return topics.filter((_, index) => allowed[index])
}

export const presentTopic = (topic: ParsedTopic): HelpTopic => ({
  slug: topic.slug,
  title: topic.title,
  summary: topic.summary,
  area: topic.area,
  order: topic.order,
  keywords: topic.keywords,
})

export const presentPage = (topic: ParsedTopic): HelpTopicPage => ({
  ...presentTopic(topic),
  html: topic.html,
  sections: topic.sections,
})

// The text around a match, to read under a result: it starts at the beginning
// of that sentence where there is one nearby, and never cuts a word in half.
const snippetAround = (text: string, at: number, length = 220) => {
  const runUp = text.slice(Math.max(0, at - 160), at)
  const sentence = runUp.lastIndexOf('. ')
  let start = sentence === -1 ? Math.max(0, at - 70) : Math.max(0, at - 160) + sentence + 2
  if (start > 0 && sentence === -1) {
    const space = text.indexOf(' ', start)
    start = space === -1 ? start : space + 1
  }

  let end = Math.min(text.length, start + length)
  if (end < text.length) {
    const stop = text.lastIndexOf('. ', end)
    const space = text.lastIndexOf(' ', end)
    end = stop > start + length / 2 ? stop + 1 : space > start ? space : end
  }

  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

// Every word must appear somewhere in the topic. Title and summary matches come
// first, then body matches, each with the text around the word that matched.
export const searchTopics = (topics: ParsedTopic[], query: string): HelpSearchHit[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []

  return topics.flatMap((topic) => {
    const haystacks = {
      title: topic.title.toLowerCase(),
      summary: topic.summary.toLowerCase(),
      keywords: topic.keywords.join(' ').toLowerCase(),
      text: topic.text.toLowerCase(),
    }
    const whole = Object.values(haystacks).join(' ')
    if (!words.every(word => whole.includes(word))) return []

    const inHeading = words.every(word => `${haystacks.title} ${haystacks.summary} ${haystacks.keywords}`.includes(word))
    const at = haystacks.text.indexOf(words[0]!)

    return [{
      ...presentTopic(topic),
      rank: inHeading ? 0 : 1,
      snippet: at === -1 ? topic.summary : snippetAround(topic.text, at),
    }]
  }).sort((a, b) => a.rank - b.rank || a.order - b.order)
}
