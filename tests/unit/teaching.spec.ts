// Teachers editing their own messages, against a throwaway SQLite database.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { teacherSermonSchema } from '../../shared/sermons'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-teaching-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let sermons: typeof import('../../server/lib/sermons')
let orm: typeof import('drizzle-orm')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  sermons = await import('../../server/lib/sermons')
  orm = await import('drizzle-orm')
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

const addUser = (email: string) =>
  db.insert(schema.user).values({ id: crypto.randomUUID(), name: email, email, emailVerified: true, createdAt: new Date(), updatedAt: new Date() }).returning().get().id

const addSermon = (values: { title: string, speaker: string, speakerPersonId?: string | null, status?: 'draft' | 'published' }) =>
  db.insert(schema.sermons).values({ slug: crypto.randomUUID(), preachedOn: '2027-03-07', status: 'published', ...values }).returning().get()

describe('teachers', () => {
  let teacherUser: string
  let otherUser: string
  let robert: string

  beforeAll(() => {
    teacherUser = addUser('robert@example.org')
    otherUser = addUser('other@example.org')
    robert = db.insert(schema.people).values({ firstName: 'Robert', lastName: 'Hayes', isSpeaker: true, userId: teacherUser }).returning().get().id
    db.insert(schema.people).values({ firstName: 'Olive', lastName: 'Other', userId: otherUser }).run()
  })

  it('lets a teacher change only the details, refusing the video, speaker, audience and status', () => {
    expect(teacherSermonSchema.safeParse({ title: 'New title', scripture: 'John 3', tags: ['Grace'] }).success).toBe(true)
    for (const field of [{ video: 'https://youtu.be/abc' }, { speaker: 'Someone else' }, { speakerPersonId: 'x' }, { visibility: 'public' }, { status: 'published' }]) {
      expect(teacherSermonSchema.safeParse({ title: 'New title', ...field }).success).toBe(false)
    }
  })

  it('knows a message’s teacher by the person linked to their account', () => {
    const mine = addSermon({ title: 'The Good Shepherd', speaker: 'Robert Hayes', speakerPersonId: robert })
    const guest = addSermon({ title: 'Guest morning', speaker: 'Robert Hayes' })
    expect(sermons.isTeacherOf(mine, teacherUser)).toBe(true)
    expect(sermons.isTeacherOf(mine, otherUser)).toBe(false)
    expect(sermons.isTeacherOf(mine, null)).toBe(false)
    // A typed name that happens to match is not a link.
    expect(sermons.isTeacherOf(guest, teacherUser)).toBe(false)
  })

  it('lists a teacher’s own messages, drafts included', () => {
    addSermon({ title: 'Draft on grace', speaker: 'Robert Hayes', speakerPersonId: robert, status: 'draft' })
    expect(sermons.loadTeacherSermons(teacherUser).map(s => s.title).sort()).toEqual(['Draft on grace', 'The Good Shepherd'])
    expect(sermons.loadTeacherSermons(otherUser)).toEqual([])
  })

  it('links a message only to someone on the Speakers list, and offers archived speakers only when still linked', () => {
    const olive = db.select().from(schema.people).where(orm.eq(schema.people.firstName, 'Olive')).get()!
    expect(() => sermons.assertSpeakerPerson(olive.id)).toThrow(/Speakers list/)
    expect(() => sermons.assertSpeakerPerson(robert)).not.toThrow()

    const retired = db.insert(schema.people).values({ firstName: 'Ray', lastName: 'Retired', isSpeaker: true, speakerArchivedAt: new Date() }).returning().get().id
    expect(sermons.speakerChoices().map(c => c.name)).toEqual(['Robert Hayes'])
    addSermon({ title: 'Old message', speaker: 'Ray Retired', speakerPersonId: retired })
    expect(sermons.speakerChoices().map(c => c.name)).toEqual(['Robert Hayes', 'Ray Retired'])
  })

  it('links existing messages by exact name when the migration runs, but never guesses between two people', () => {
    const backfill = readFileSync('server/database/migrations/0016_sermon_speaker_person.sql', 'utf8').split('--> statement-breakpoint').at(-1)!
    const unique = addSermon({ title: 'Before the link', speaker: 'Robert Hayes', speakerPersonId: null })
    db.insert(schema.people).values([{ firstName: 'Sam', lastName: 'Same', isSpeaker: true }, { firstName: 'Sam', lastName: 'Same', isSpeaker: true }]).run()
    const ambiguous = addSermon({ title: 'Which Sam', speaker: 'Sam Same', speakerPersonId: null })

    db.run(orm.sql.raw(backfill))
    const reload = (id: string) => db.select().from(schema.sermons).where(orm.eq(schema.sermons.id, id)).get()!
    expect(reload(unique.id).speakerPersonId).toBe(robert)
    expect(reload(ambiguous.id).speakerPersonId).toBeNull()
  })
})
