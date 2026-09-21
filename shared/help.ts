// Help pages: the shapes the pages and the server agree on. Content lives in
// server/assets/help/*.md; see server/lib/help.ts.

// Areas group the contents list. Add one here before using it in a page's
// front matter, in the order they should appear.
export const HELP_AREAS = [
  'Offerings and giving',
] as const
export type HelpArea = typeof HELP_AREAS[number]

export interface HelpTopic {
  slug: string
  title: string
  summary: string
  area: HelpArea
  order: number
  keywords: string[]
}

// One entry in a page's own contents list (h2 and h3 headings).
export interface HelpSection {
  id: string
  label: string
  depth: number
}

export interface HelpTopicPage extends HelpTopic {
  html: string
  sections: HelpSection[]
}

export interface HelpSearchHit extends HelpTopic {
  // 0 = the words are in the title, summary or keywords; 1 = in the page body.
  rank: number
  snippet: string
}

// The contents list, grouped in HELP_AREAS order.
export const groupByArea = (topics: HelpTopic[]) =>
  HELP_AREAS
    .map(area => ({ area, topics: topics.filter(topic => topic.area === area) }))
    .filter(group => group.topics.length)
