// Sermon rules against a real, throwaway SQLite database with every migration applied.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sermonSchema, sermonSlug } from '../../shared/sermons'
import { parseYouTubeId } from '../../shared/youtube'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-sermons-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let lib: typeof import('../../server/lib/sermons')
let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')

const PUBLIC = { isMember: false, canManage: false }
const MEMBER = { isMember: true, canManage: false }
const EDITOR = { isMember: false, canManage: true }

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  lib = await import('../../server/lib/sermons')

  const base = { speaker: 'Pastor Dave', videoProvider: 'youtube' as const }
  db.insert(schema.sermons).values([
    { ...base, slug: 'public-one', title: 'Public One', preachedOn: '2025-06-22', visibility: 'public', status: 'published', videoId: 'aaaaaaaaaaa' },
    { ...base, slug: 'members-one', title: 'Secret Members Title', preachedOn: '2025-06-15', visibility: 'members', status: 'published', videoId: 'bbbbbbbbbbb' },
    { ...base, slug: 'draft-one', title: 'Draft Title', preachedOn: '2025-06-29', visibility: 'public', status: 'draft', videoId: 'ccccccccccc' },
  ]).run()
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('YouTube links', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abcdef'],
    ['youtu.be/dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ?feature=share'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['dQw4w9WgXcQ'],
  ])('reads the video id from %s', (link) => {
    expect(parseYouTubeId(link)).toBe('dQw4w9WgXcQ')
  })

  it.each([
    ['https://vimeo.com/123456'],
    ['https://www.youtube.com/@lifegate'],
    ['https://evil.example/watch?v=dQw4w9WgXcQ'],
    ['https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'],
    ['not a link'],
  ])('rejects %s', (link) => {
    expect(parseYouTubeId(link)).toBeNull()
  })
})

describe('sermon slugs', () => {
  it('combines date and title into a readable, stable link', () => {
    expect(sermonSlug('2025-06-22', 'The Good Shepherd')).toBe('2025-06-22-the-good-shepherd')
    expect(sermonSlug('2025-05-18', 'God’s Love: 1 Corinthians 13!')).toBe('2025-05-18-gods-love-1-corinthians-13')
  })

  it('never reuses a slug', () => {
    expect(lib.uniqueSermonSlug('2025-06-22', 'Public One')).toBe('2025-06-22-public-one')
    db.insert(schema.sermons).values({ slug: '2025-06-22-public-one', title: 'x', preachedOn: '2025-06-22', speaker: 'x' }).run()
    expect(lib.uniqueSermonSlug('2025-06-22', 'Public One')).toBe('2025-06-22-public-one-2')
  })
})

describe('who can see a sermon', () => {
  it('shows the public only published public sermons', () => {
    expect(lib.canViewSermon({ status: 'published', visibility: 'public' }, PUBLIC)).toBe(true)
    expect(lib.canViewSermon({ status: 'published', visibility: 'members' }, PUBLIC)).toBe(false)
    expect(lib.canViewSermon({ status: 'draft', visibility: 'public' }, PUBLIC)).toBe(false)
  })

  it('shows members every published sermon but no drafts', () => {
    expect(lib.canViewSermon({ status: 'published', visibility: 'members' }, MEMBER)).toBe(true)
    expect(lib.canViewSermon({ status: 'draft', visibility: 'members' }, MEMBER)).toBe(false)
  })

  it('shows people who manage sermons everything', () => {
    expect(lib.canViewSermon({ status: 'draft', visibility: 'members' }, EDITOR)).toBe(true)
  })

  it('never sends the public a members-only title or video id, only a count', () => {
    const result = lib.listSermonsFor(PUBLIC)
    expect(result.sermons.map(s => s.slug)).toEqual(['public-one'])
    expect(result.hiddenCount).toBe(1)
    const json = JSON.stringify(result)
    expect(json).not.toContain('Secret Members Title')
    expect(json).not.toContain('bbbbbbbbbbb')
    expect(json).not.toContain('Draft Title')
  })

  it('lists published sermons to members, newest first, without drafts', () => {
    const result = lib.listSermonsFor(MEMBER)
    expect(result.sermons.map(s => s.slug)).toEqual(['public-one', 'members-one'])
    expect(result.hiddenCount).toBe(0)
  })
})

describe('sermon input', () => {
  const valid = {
    title: 'The Good Shepherd', preachedOn: '2025-06-22', speaker: 'Pastor Dave', seriesId: null,
    scripture: '', books: ['John'], tags: [], description: '', video: '', visibility: 'members', status: 'draft',
  }

  it('accepts a sermon with no video yet, and rejects a non-YouTube link', () => {
    expect(sermonSchema.safeParse(valid).success).toBe(true)
    expect(sermonSchema.safeParse({ ...valid, video: 'https://vimeo.com/1' }).success).toBe(false)
    expect(sermonSchema.safeParse({ ...valid, books: ['Hezekiah'] }).success).toBe(false)
  })

  it('stores provider and id, Bible order for books, and one spelling per topic', () => {
    const values = lib.toSermonValues({ video: 'https://youtu.be/dQw4w9WgXcQ', books: ['Romans', 'Genesis', 'Romans'], tags: ['Grace', 'grace', 'Faith'], scripture: '' })
    expect(values).toMatchObject({ videoProvider: 'youtube', videoId: 'dQw4w9WgXcQ', books: ['Genesis', 'Romans'], tags: ['Grace', 'Faith'], scripture: null })
    expect(lib.toSermonValues({ video: '' })).toMatchObject({ videoProvider: null, videoId: null })
  })
})
