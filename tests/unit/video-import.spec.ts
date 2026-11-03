// Bringing in videos copied onto the church server by hand: reading what a MOV/MP4 says about
// itself, suggesting which teaching it is, and filing it. Real files are written and read here.
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as shared from '../../shared/video-import'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-video-import-'))
process.env.DATABASE_PATH = join(dir, 'test.db')
const folder = join(dir, 'videos')

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let mp4: typeof import('../../server/lib/mp4-meta')
let lib: typeof import('../../server/lib/video-import')
let files: typeof import('../../server/lib/local-files')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  mp4 = await import('../../server/lib/mp4-meta')
  lib = await import('../../server/lib/video-import')
  files = await import('../../server/lib/local-files')
  mkdirSync(folder, { recursive: true })
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const statusOf = async (run: () => unknown) => {
  try {
    await run()
  }
  catch (error) {
    return (error as { statusCode?: number }).statusCode
  }
  return undefined
}

describe('the date a recording was made', () => {
  const base = { videoCreatedAt: null, modifiedAt: '2026-11-04T15:00:00Z', timeZone: 'America/Detroit' }

  it('prefers a date at the start of the file name', () => {
    expect(shared.guessDate({ ...base, fileName: '2026-11-01_The Good Shepherd.mov', videoCreatedAt: '2026-10-20T12:00:00Z' })).toEqual({ date: '2026-11-01', source: 'file-name' })
  })

  it('then the date inside the video', () => {
    expect(shared.guessDate({ ...base, fileName: 'IMG_0042.MOV', videoCreatedAt: '2026-11-01T15:30:00Z' })).toEqual({ date: '2026-11-01', source: 'video' })
  })

  it('counts the day in the church’s time zone, not UTC', () => {
    // 9:30 pm on Sunday in Michigan is already Monday in UTC.
    expect(shared.guessDate({ ...base, fileName: 'a.mov', videoCreatedAt: '2026-11-02T02:30:00Z' }).date).toBe('2026-11-01')
  })

  it('falls back to when the file was last changed, and says so', () => {
    expect(shared.guessDate({ ...base, fileName: 'a.mov' })).toEqual({ date: '2026-11-04', source: 'file-date' })
  })
})

describe('suggesting the teaching', () => {
  const teachings = [
    { id: 'near', title: 'Walking in Faith', preachedOn: '2026-11-01', speaker: 'A', hasCopy: false },
    { id: 'titled', title: 'The Good Shepherd', preachedOn: '2026-09-13', speaker: 'A', hasCopy: false },
    { id: 'week-later', title: 'Grace Alone', preachedOn: '2026-11-08', speaker: 'A', hasCopy: true },
    { id: 'far', title: 'Something Else', preachedOn: '2026-03-01', speaker: 'A', hasCopy: false },
  ]
  const guess = { date: '2026-11-01', source: 'file-date' as const }

  it('offers the same and nearby days, and leaves out unrelated far ones', () => {
    const ids = shared.suggestTeachings(teachings, guess, 'IMG_0042.MOV').map(item => item.id)
    expect(ids).toEqual(['near', 'week-later'])
  })

  it('lets words in the file name outweigh a wrong date', () => {
    const [first] = shared.suggestTeachings(teachings, guess, 'The Good Shepherd.mov')
    expect(first!.id).toBe('titled')
    expect(first!.titleMatch).toBe(1)
  })

  it('says how far apart and whether the teaching already has a copy', () => {
    const found = shared.suggestTeachings(teachings, guess, 'x.mov')
    expect(found.find(item => item.id === 'week-later')).toMatchObject({ daysApart: 7, hasCopy: true })
  })

  it('ignores filler words when comparing titles', () => {
    expect(shared.titleOverlap('Sunday Morning Service', 'The Message')).toBe(0)
    expect(shared.titleOverlap('Grace Alone Part 2', 'Grace Alone')).toBe(1)
  })

  it('formats how long a video runs', () => {
    expect(shared.formatDuration(null)).toBe('')
    expect(shared.formatDuration(65)).toBe('1:05')
    expect(shared.formatDuration(3725)).toBe('1:02:05')
  })
})

// ---- reading a real MOV / MP4 -------------------------------------------------------------
const box = (type: string | Buffer, ...payload: Buffer[]) => {
  const body = Buffer.concat(payload)
  const head = Buffer.alloc(8)
  head.writeUInt32BE(8 + body.length, 0)
  Buffer.from(type as string, 'latin1').copy(head, 4)
  return Buffer.concat([head, body])
}
const SECONDS_1904_TO_1970 = 2_082_844_800
const mvhd = (unix: number, timescale: number, duration: number, version = 0) => {
  const body = Buffer.alloc(version === 1 ? 112 : 100)
  body[0] = version
  if (version === 1) {
    body.writeBigUInt64BE(BigInt(unix + SECONDS_1904_TO_1970), 4)
    body.writeUInt32BE(timescale, 20)
    body.writeBigUInt64BE(BigInt(duration), 24)
  }
  else {
    body.writeUInt32BE(unix + SECONDS_1904_TO_1970, 4)
    body.writeUInt32BE(timescale, 12)
    body.writeUInt32BE(duration, 16)
  }
  return box('mvhd', body)
}
const xyz = (text: string) => {
  const string = Buffer.from(text, 'latin1')
  const head = Buffer.alloc(4)
  head.writeUInt16BE(string.length, 0)
  const atom = Buffer.concat([head, string])
  const size = Buffer.alloc(4)
  size.writeUInt32BE(8 + atom.length, 0)
  return Buffer.concat([size, Buffer.from([0xA9, 0x78, 0x79, 0x7A]), atom])
}
const SUNDAY = Date.parse('2026-11-01T15:30:00Z') / 1000

describe('reading a MOV or MP4', () => {
  const write = (name: string, ...boxes: Buffer[]) => {
    const path = join(dir, name)
    writeFileSync(path, Buffer.concat(boxes))
    return path
  }
  const ftyp = box('ftyp', Buffer.from('qt  0000qt  ', 'latin1'))
  const mdat = box('mdat', Buffer.alloc(5000, 1))

  it('reads when and how long, with the index at the end of the file (as cameras write it)', async () => {
    const path = write('end.mov', ftyp, mdat, box('moov', mvhd(SUNDAY, 1000, 3_600_000)))
    expect(await mp4.readVideoMeta(path)).toEqual({ createdAt: '2026-11-01T15:30:00.000Z', durationSeconds: 3600, location: null })
  })

  it('reads it with the index at the start', async () => {
    const path = write('start.mp4', ftyp, box('moov', mvhd(SUNDAY, 600, 36_000)), mdat)
    expect(await mp4.readVideoMeta(path)).toMatchObject({ createdAt: '2026-11-01T15:30:00.000Z', durationSeconds: 60 })
  })

  it('reads the wide form of the header', async () => {
    const path = write('wide.mov', ftyp, mdat, box('moov', mvhd(SUNDAY, 1000, 90_000, 1)))
    expect(await mp4.readVideoMeta(path)).toMatchObject({ createdAt: '2026-11-01T15:30:00.000Z', durationSeconds: 90 })
  })

  it('reads a phone’s position', async () => {
    const path = write('gps.mov', ftyp, mdat, box('moov', mvhd(SUNDAY, 1000, 1000), box('udta', xyz('+42.3601-071.0589+012.000/'))))
    expect((await mp4.readVideoMeta(path)).location).toEqual({ latitude: 42.3601, longitude: -71.0589 })
  })

  it('prefers an iPhone’s local recording time and reads its position key', async () => {
    const apple = Buffer.from('....com.apple.quicktime.creationdate....data....2026-11-01T10:30:12-0500....com.apple.quicktime.location.ISO6709....data....+42.3601-071.0589+012.000/', 'latin1')
    const path = write('iphone.mov', ftyp, mdat, box('moov', mvhd(SUNDAY + 3600, 1000, 1000), box('meta', apple)))
    expect(await mp4.readVideoMeta(path)).toMatchObject({ createdAt: '2026-11-01T15:30:12.000Z', location: { latitude: 42.3601, longitude: -71.0589 } })
  })

  it('treats an unset clock as no date, and an impossible position as none', async () => {
    const path = write('unset.mov', ftyp, mdat, box('moov', mvhd(-SECONDS_1904_TO_1970, 1000, 1000), box('udta', xyz('+95.0000+000.0000/'))))
    expect(await mp4.readVideoMeta(path)).toEqual({ createdAt: null, durationSeconds: 1, location: null })
  })

  it('returns nothing, without failing, for a file that is not a video or is cut short', async () => {
    const nothing = { createdAt: null, durationSeconds: null, location: null }
    expect(await mp4.readVideoMeta(write('text.mov', Buffer.from('not a movie at all')))).toEqual(nothing)
    expect(await mp4.readVideoMeta(write('cut.mov', ftyp, box('moov', mvhd(SUNDAY, 1000, 1000)).subarray(0, 40)))).toEqual(nothing)
    expect(await mp4.readVideoMeta(join(dir, 'missing.mov'))).toEqual(nothing)
  })
})

// ---- the import itself --------------------------------------------------------------------
let counter = 0
const account = () => {
  const n = ++counter
  const now = new Date()
  return db.insert(schema.user).values({ id: `vi-u-${n}`, name: 'Volunteer', email: `vi${n}@example.org`, emailVerified: true, createdAt: now, updatedAt: now }).returning().get().id
}
const message = (over: Partial<typeof schema.sermons.$inferInsert> = {}) => {
  const n = ++counter
  return db.insert(schema.sermons).values({ slug: `2026-11-01-vi-${n}`, title: `Import message ${n}`, preachedOn: '2026-11-01', speaker: 'Speaker', status: 'draft', visibility: 'members', ...over }).returning().get()
}
const drop = (name: string, content = 'pretend video bytes') => {
  const directory = lib.importDirectory(folder)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, name), content)
  return join(directory, name)
}

describe('looking in the import folder', () => {
  it('makes the folder, and lists only visible video files, each with its date and suggestions', async () => {
    const sermon = message({ preachedOn: '2026-10-25', title: 'The Vine and the Branches' })
    drop('2026-10-25_The Vine and the Branches.mov')
    drop('notes.txt')
    drop('.hidden.mov')
    mkdirSync(join(lib.importDirectory(folder), 'a-folder.mov'))
    const found = await lib.scanImport(folder, 'America/Detroit')
    expect(found.directory).toBe(join(folder, 'import'))
    const file = found.files.find(item => item.name.startsWith('2026-10-25'))!
    expect(found.files.map(item => item.name)).not.toContain('notes.txt')
    expect(found.files.map(item => item.name)).not.toContain('.hidden.mov')
    expect(found.files.map(item => item.name)).not.toContain('a-folder.mov')
    expect(file.date).toEqual({ date: '2026-10-25', source: 'file-name' })
    expect(file.size).toBe('pretend video bytes'.length)
    expect(file.suggestions[0]!.id).toBe(sermon.id)
    expect(found.teachings.some(item => item.id === sermon.id)).toBe(true)
  })
})

describe('filing a video from the import folder', () => {
  it('moves it into its permanent place, records it, and removes it from the import folder', async () => {
    const sermon = message()
    const user = account()
    const path = drop('a.mov', 'file one')
    const stored = await lib.importFile({ folder, fileName: 'a.mov', sermonId: sermon.id, replace: false, userId: user })
    expect(existsSync(path)).toBe(false)
    expect(stored.relativePath).toMatch(new RegExp(`^2026/${sermon.slug}-${sermon.id.slice(0, 8)}/original\\.mov$`))
    expect(existsSync(files.absolutePath(folder, stored.relativePath))).toBe(true)
    const record = files.loadLocalFile(sermon.id)!
    expect(record).toMatchObject({ size: 'file one'.length, sha256: stored.sha256, storedBy: user, fileName: 'a.mov' })
  })

  it('leaves a teaching that already has a copy alone unless told to replace it', async () => {
    const sermon = message()
    const user = account()
    drop('first.mov', 'first')
    await lib.importFile({ folder, fileName: 'first.mov', sermonId: sermon.id, replace: false, userId: user })
    const second = drop('second.mov', 'second, longer')
    expect(await statusOf(() => lib.importFile({ folder, fileName: 'second.mov', sermonId: sermon.id, replace: false, userId: user }))).toBe(409)
    expect(existsSync(second)).toBe(true)
    expect(files.loadLocalFile(sermon.id)!.size).toBe('first'.length)
    await lib.importFile({ folder, fileName: 'second.mov', sermonId: sermon.id, replace: true, userId: user })
    expect(files.loadLocalFile(sermon.id)!.size).toBe('second, longer'.length)
    expect(existsSync(second)).toBe(false)
  })

  it('refuses names that are paths, hidden files, other kinds of file, and files that are not there', async () => {
    const sermon = message()
    const user = account()
    const outside = join(dir, 'outside.mov')
    writeFileSync(outside, 'outside')
    drop('notes.txt')
    for (const name of ['../outside.mov', `${dir}/outside.mov`, '.hidden.mov', 'notes.txt', 'nothing-here.mov']) {
      expect(await statusOf(() => lib.importFile({ folder, fileName: name, sermonId: sermon.id, replace: false, userId: user })), name).toBeOneOf([400, 404])
    }
    expect(existsSync(outside)).toBe(true)
    expect(files.loadLocalFile(sermon.id)).toBeUndefined()
  })

  it('will not follow a link to a file somewhere else', async () => {
    const sermon = message()
    const target = join(dir, 'private.mov')
    writeFileSync(target, 'private')
    mkdirSync(lib.importDirectory(folder), { recursive: true })
    symlinkSync(target, join(lib.importDirectory(folder), 'link.mov'))
    expect(await statusOf(() => lib.importFile({ folder, fileName: 'link.mov', sermonId: sermon.id, replace: false, userId: account() }))).toBe(404)
    expect(existsSync(target)).toBe(true)
  })

  it('says so when the teaching does not exist, and keeps the file', async () => {
    const path = drop('orphan.mov')
    expect(await statusOf(() => lib.importFile({ folder, fileName: 'orphan.mov', sermonId: 'no-such-id', replace: false, userId: account() }))).toBe(404)
    expect(existsSync(path)).toBe(true)
  })
})
