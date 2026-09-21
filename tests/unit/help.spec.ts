// Help pages: the front matter every page must carry, and the search.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTopic, searchTopics } from '../../server/lib/help'
import { groupByArea, HELP_AREAS } from '../../shared/help'

const dir = 'server/assets/help'
const files = readdirSync(dir).filter(name => name.endsWith('.md'))
const read = (name: string) => parseTopic(name.replace(/\.md$/, ''), readFileSync(join(dir, name), 'utf8'))

const page = (front: string, body = '## A heading\n\nSome words.\n') =>
  parseTopic('sample', `---\n${front}\n---\n\n${body}`)
const valid = 'title: Sample\nsummary: A sample page.\narea: Offerings and giving\norder: 5\npermission: giving:record'

describe('every help page', () => {
  it('exists', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s has the front matter the site needs', (name) => {
    const topic = read(name)
    expect(topic.title).toBeTruthy()
    expect(topic.summary).toBeTruthy()
    expect(HELP_AREAS).toContain(topic.area)
    expect(Object.keys(topic.permission).length).toBeGreaterThan(0)
    // Something to read, with headings to link to.
    expect(topic.html).toContain('<p>')
    expect(topic.sections.length).toBeGreaterThan(0)
  })

  it('groups into areas for the contents list', () => {
    const groups = groupByArea(files.map(read))
    expect(groups.length).toBeGreaterThan(0)
    expect(groups.flatMap(group => group.topics).length).toBe(files.length)
  })
})

describe('front matter', () => {
  it('reads fields, lists and permissions', () => {
    const topic = page(`${valid}\nkeywords: [cash, check]`)
    expect(topic).toMatchObject({ slug: 'sample', title: 'Sample', area: 'Offerings and giving', order: 5, keywords: ['cash', 'check'] })
    expect(topic.permission).toEqual({ giving: ['record'] })
    expect(page(`${valid.replace('permission: giving:record', 'permission: giving:view, stewardship:manage')}`).permission)
      .toEqual({ giving: ['view'], stewardship: ['manage'] })
  })

  it('gives every heading an id to link to, and lists them', () => {
    const topic = page(valid, '## Counting the cash\n\nWords.\n\n### A check from last week\n\nMore.\n')
    expect(topic.html).toContain('<h2 id="counting-the-cash">')
    expect(topic.sections).toEqual([
      { id: 'counting-the-cash', label: 'Counting the cash', depth: 2 },
      { id: 'a-check-from-last-week', label: 'A check from last week', depth: 3 },
    ])
  })

  it('refuses a page that would show up wrong', () => {
    expect(() => parseTopic('sample', 'No front matter here')).toThrow(/front matter/)
    expect(() => page(valid.replace('title: Sample\n', ''))).toThrow(/needs a `title`/)
    expect(() => page(valid.replace('permission: giving:record', 'permission: giving'))).toThrow(/bad permission/)
    expect(() => page(valid.replace('area: Offerings and giving', 'area: Flower Rota'))).toThrow(/unknown area/)
  })
})

describe('search', () => {
  const topics = [
    page(`${valid}\ntitle: Closing a count`, '## Cash and checks\n\nA count closes only when the cash and checks match the sheet.\n'),
    { ...page(`${valid}\ntitle: Giving records`, '## Addresses\n\nThe mailing address is the treasurer\'s own.\n'), slug: 'giving-records' },
  ]

  it('needs every word, and puts title matches first', () => {
    expect(searchTopics(topics, 'count').map(hit => hit.title)).toEqual(['Closing a count'])
    expect(searchTopics(topics, 'cash checks').map(hit => hit.title)).toEqual(['Closing a count'])
    expect(searchTopics(topics, 'address').map(hit => hit.title)).toEqual(['Giving records'])
    expect(searchTopics(topics, 'cash flowers')).toEqual([])
    expect(searchTopics(topics, '   ')).toEqual([])
    // "records" is in the title; "closes" is only in the body.
    expect(searchTopics(topics, 'records')[0]).toMatchObject({ rank: 0 })
    expect(searchTopics(topics, 'closes')[0]).toMatchObject({ rank: 1 })
  })

  it('shows where the word was found', () => {
    expect(searchTopics(topics, 'sheet')[0]!.snippet).toContain('match the sheet')
  })
})
