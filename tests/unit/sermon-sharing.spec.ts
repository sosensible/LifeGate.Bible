// Who may see a message once its office, its teacher, the pastor and an administrator
// have each had their say. Four parties, each with a control of their own, none able to
// override another. See shared/sermon-sharing.ts.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { roles } from '../../shared/auth/permissions'
import { availability, blockedSentence, HOLD_PARTIES, TEACHER_SHARES, type HoldParty, type TeacherShare } from '../../shared/sermon-sharing'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-sermon-sharing-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let lib: typeof import('../../server/lib/sermons')
let orm: typeof import('drizzle-orm')

const PUBLIC = { isMember: false, canManage: false }
const MEMBER = { isMember: true, canManage: false }
const EDITOR = { isMember: true, canManage: true }
const PASTOR = { isMember: true, canManage: false, canHold: true }

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  lib = await import('../../server/lib/sermons')
  orm = await import('drizzle-orm')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

let counter = 0
const unique = () => `${++counter}`
const statusOf = (fn: () => unknown) => {
  try { fn() }
  catch (error) { return (error as { statusCode?: number }).statusCode }
  return undefined
}
const tx = <T>(fn: (t: Parameters<Parameters<typeof db.transaction>[0]>[0]) => T) => db.transaction(fn)

// A message, and optionally the person and account that taught it.
const message = (over: Partial<typeof schema.sermons.$inferInsert> = {}) => {
  const n = unique()
  return db.insert(schema.sermons).values({ slug: `m-${n}`, title: `Message ${n}`, preachedOn: '2026-01-01', speaker: 'Speaker', status: 'published', visibility: 'public', ...over }).returning().get()
}
const teacher = (name = 'Tess') => {
  const n = unique()
  const now = new Date()
  const account = db.insert(schema.user).values({ id: `u-${n}`, name, email: `${name}${n}@example.org`, emailVerified: true, createdAt: now, updatedAt: now }).returning().get()
  const person = db.insert(schema.people).values({ firstName: name, lastName: `Teacher${n}`, userId: account.id, isSpeaker: true }).returning().get()
  return { userId: account.id, personId: person.id }
}
const load = (id: string) => lib.loadSermon({ id })!
const holdBy = (id: string, party: HoldParty, userId = teacher('Holder').userId) => tx(t => lib.placeHold(t, id, party, userId))

// ---------------------------------------------------------------------------

describe('who is blocking a message, and who may see it', () => {
  type Case = { status: 'draft' | 'published', visibility: 'public' | 'members', teacher: TeacherShare, holds: HoldParty[] }
  const audienceOf = (c: Case) => availability({ status: c.status, visibility: c.visibility, teacherShare: c.teacher, holds: c.holds }).audience

  it('shows the narrowest audience any of them allows', () => {
    expect(audienceOf({ status: 'published', visibility: 'public', teacher: 'public', holds: [] })).toBe('public')
    expect(audienceOf({ status: 'published', visibility: 'public', teacher: 'members', holds: [] })).toBe('members')
    expect(audienceOf({ status: 'published', visibility: 'members', teacher: 'public', holds: [] })).toBe('members')
    expect(audienceOf({ status: 'published', visibility: 'members', teacher: 'members', holds: [] })).toBe('members')
  })

  it('shows nobody while any one party is blocking, whatever the others allow', () => {
    for (const teacherShare of TEACHER_SHARES) {
      for (const holds of [[], ['pastor'], ['admin'], ['pastor', 'admin']] as HoldParty[][]) {
        const blocked = teacherShare === 'none' || holds.length > 0
        expect(audienceOf({ status: 'published', visibility: 'public', teacher: teacherShare, holds }) === 'nobody').toBe(blocked)
      }
    }
  })

  it('does not show a draft to anyone, however open the rest is', () => {
    expect(audienceOf({ status: 'draft', visibility: 'public', teacher: 'public', holds: [] })).toBe('nobody')
  })

  it('names everyone who is blocking it', () => {
    expect(availability({ status: 'published', visibility: 'public', teacherShare: 'none', holds: ['pastor', 'admin'] }).blockedBy).toEqual(['teacher', 'pastor', 'admin'])
    expect(availability({ status: 'published', visibility: 'public', teacherShare: 'members', holds: [] }).blockedBy).toEqual([])
    expect(blockedSentence(['pastor'])).toBe('Paused by the pastor')
    expect(blockedSentence(['teacher', 'admin'])).toBe('Paused by the teacher and an administrator')
    expect(blockedSentence(['teacher', 'pastor', 'admin'])).toBe('Paused by the teacher, the pastor and an administrator')
    expect(blockedSentence([])).toBe('')
  })

  it('treats a message with no teacher choice or holds as it always was', () => {
    expect(availability({ status: 'published', visibility: 'members' }).audience).toBe('members')
    expect(availability({ status: 'published', visibility: 'public' }).audience).toBe('public')
  })
})

describe('what each viewer may open', () => {
  it('starts open: a message nobody has limited is shown as the office set it', () => {
    const open = load(message({ visibility: 'public' }).id)
    expect(open.teacherShare).toBe('public')
    expect(open.holds).toEqual([])
    expect(lib.canViewSermon(open, PUBLIC)).toBe(true)
  })

  it('limits a message to members when its teacher does, and not for the office or a pastor', () => {
    const t = teacher()
    const row = message({ speakerPersonId: t.personId })
    tx(x => lib.setTeacherShare(x, row.id, t.userId, 'members'))
    const limited = load(row.id)
    expect(lib.canViewSermon(limited, PUBLIC)).toBe(false)
    expect(lib.canViewSermon(limited, MEMBER)).toBe(true)
    expect(lib.canViewSermon(limited, EDITOR)).toBe(true)
  })

  it('shows nobody a message its teacher has withdrawn, except those who run the teaching', () => {
    const t = teacher()
    const row = message({ speakerPersonId: t.personId })
    tx(x => lib.setTeacherShare(x, row.id, t.userId, 'none'))
    const withdrawn = load(row.id)
    expect(lib.canViewSermon(withdrawn, PUBLIC)).toBe(false)
    expect(lib.canViewSermon(withdrawn, MEMBER)).toBe(false)
    expect(lib.canViewSermon(withdrawn, EDITOR)).toBe(true)
  })

  it('shows nobody a message the pastor or an administrator has paused', () => {
    for (const party of HOLD_PARTIES) {
      const row = message()
      holdBy(row.id, party)
      const paused = load(row.id)
      expect(lib.canViewSermon(paused, PUBLIC)).toBe(false)
      expect(lib.canViewSermon(paused, MEMBER)).toBe(false)
      expect(lib.canViewSermon(paused, EDITOR)).toBe(true)
    }
  })

  it('lets someone who may pause a message open one that is paused, so they can lift it, but never a draft', () => {
    const paused = message()
    holdBy(paused.id, 'pastor')
    expect(lib.canViewSermon(load(paused.id), PASTOR)).toBe(true)
    const draft = message({ status: 'draft' })
    expect(lib.canViewSermon(load(draft.id), PASTOR)).toBe(false)
    expect(lib.canViewSermon(load(paused.id), MEMBER)).toBe(false)
  })
})

describe('the teaching lists', () => {
  it('leaves a paused or withdrawn message out, and does not hint at it to someone who is not a member', () => {
    const t = teacher()
    const before = lib.listSermonsFor(PUBLIC).hiddenCount
    const paused = message({ title: 'Paused Title' })
    holdBy(paused.id, 'admin')
    const withdrawn = message({ title: 'Withdrawn Title', speakerPersonId: t.personId })
    tx(x => lib.setTeacherShare(x, withdrawn.id, t.userId, 'none'))

    const asPublic = lib.listSermonsFor(PUBLIC)
    const asMember = lib.listSermonsFor(MEMBER)
    for (const list of [asPublic, asMember]) {
      const titles = list.sermons.map(s => s.title)
      expect(titles).not.toContain('Paused Title')
      expect(titles).not.toContain('Withdrawn Title')
    }
    expect(asPublic.hiddenCount).toBe(before)
    expect(JSON.stringify(asPublic)).not.toMatch(/Paused Title|Withdrawn Title/)
  })

  it('counts a message limited to members as one a sign-in would open, and shows it to members', () => {
    const t = teacher()
    const before = lib.listSermonsFor(PUBLIC).hiddenCount
    const row = message({ title: 'Members Now', speakerPersonId: t.personId })
    tx(x => lib.setTeacherShare(x, row.id, t.userId, 'members'))
    expect(lib.listSermonsFor(PUBLIC).hiddenCount).toBe(before + 1)
    expect(lib.listSermonsFor(PUBLIC).sermons.map(s => s.title)).not.toContain('Members Now')
    expect(lib.listSermonsFor(MEMBER).sermons.map(s => s.title)).toContain('Members Now')
  })

  it('keeps a message off a speaker’s page while it is blocked', async () => {
    const personLib = await import('../../server/lib/person-page')
    const t = teacher('Spk')
    const row = message({ title: 'On The Page', speakerPersonId: t.personId })
    const viewer = { isMember: true, isStaff: false, personId: null, householdId: null, householdRole: null }
    const titles = () => personLib.loadPersonPage(viewer as never, t.personId)!.messages.map(m => m.title)
    expect(titles()).toContain('On The Page')
    holdBy(row.id, 'pastor')
    expect(titles()).not.toContain('On The Page')
  })
})

describe('the teacher’s own control', () => {
  it('changes only the teacher’s choice, and only for their own messages', () => {
    const t = teacher()
    const other = teacher('Other')
    const row = message({ speakerPersonId: t.personId, visibility: 'public' })
    expect(statusOf(() => tx(x => lib.setTeacherShare(x, row.id, other.userId, 'none')))).toBe(404)
    expect(statusOf(() => tx(x => lib.setTeacherShare(x, row.id, 'no-such-user', 'none')))).toBe(404)
    expect(load(row.id).teacherShare).toBe('public')

    expect(tx(x => lib.setTeacherShare(x, row.id, t.userId, 'members'))).toBe(true)
    expect(tx(x => lib.setTeacherShare(x, row.id, t.userId, 'members'))).toBe(false)
    const after = load(row.id)
    expect(after).toMatchObject({ teacherShare: 'members', visibility: 'public', status: 'published' })
  })

  it('does not belong to a guest speaker with no account, whose messages only the office controls', () => {
    const row = message({ speaker: 'Guest Speaker' })
    expect(statusOf(() => tx(x => lib.setTeacherShare(x, row.id, 'anyone', 'none')))).toBe(404)
  })

  it('never lets a teacher show more than the office allows', () => {
    const t = teacher()
    const row = message({ speakerPersonId: t.personId, visibility: 'members' })
    tx(x => lib.setTeacherShare(x, row.id, t.userId, 'public'))
    expect(lib.canViewSermon(load(row.id), PUBLIC)).toBe(false)
    expect(lib.canViewSermon(load(row.id), MEMBER)).toBe(true)
  })

  it('does not lift a pause the pastor or an administrator placed', () => {
    const t = teacher()
    const row = message({ speakerPersonId: t.personId })
    holdBy(row.id, 'pastor')
    tx(x => lib.setTeacherShare(x, row.id, t.userId, 'public'))
    expect(lib.canViewSermon(load(row.id), MEMBER)).toBe(false)
  })
})

describe('the pastor’s and the administrator’s pauses', () => {
  it('are separate: lifting one leaves the other, and the message stays blocked until both are lifted', () => {
    const row = message()
    holdBy(row.id, 'pastor')
    holdBy(row.id, 'admin')
    expect(load(row.id).holds.map(h => h.party).sort()).toEqual(['admin', 'pastor'])

    expect(tx(x => lib.liftHold(x, row.id, 'admin'))).toBe(true)
    expect(load(row.id).holds.map(h => h.party)).toEqual(['pastor'])
    expect(lib.canViewSermon(load(row.id), MEMBER)).toBe(false)

    expect(tx(x => lib.liftHold(x, row.id, 'pastor'))).toBe(true)
    expect(lib.canViewSermon(load(row.id), MEMBER)).toBe(true)
  })

  it('can be placed twice or lifted twice without harm, and say whether anything changed', () => {
    const row = message()
    expect(holdBy(row.id, 'pastor')).toBe(true)
    expect(holdBy(row.id, 'pastor')).toBe(false)
    expect(load(row.id).holds).toHaveLength(1)
    expect(tx(x => lib.liftHold(x, row.id, 'pastor'))).toBe(true)
    expect(tx(x => lib.liftHold(x, row.id, 'pastor'))).toBe(false)
  })

  it('records who placed it', () => {
    const row = message()
    const who = teacher('Admin').userId
    tx(x => lib.placeHold(x, row.id, 'admin', who))
    expect(db.select().from(schema.sermonHolds).where(orm.eq(schema.sermonHolds.sermonId, row.id)).get()!.placedBy).toBe(who)
  })

  it('is refused for a message that does not exist', () => {
    expect(statusOf(() => holdBy('missing', 'pastor'))).toBe(404)
    expect(statusOf(() => tx(x => lib.liftHold(x, 'missing', 'pastor')))).toBe(404)
  })

  it('goes with the message when it is deleted', () => {
    const row = message()
    holdBy(row.id, 'pastor')
    db.delete(schema.sermons).where(orm.eq(schema.sermons.id, row.id)).run()
    expect(db.select().from(schema.sermonHolds).where(orm.eq(schema.sermonHolds.sermonId, row.id)).all()).toEqual([])
  })
})

describe('what the screens are told', () => {
  it('describes who has set what, and the result', () => {
    const t = teacher()
    const row = message({ speakerPersonId: t.personId, visibility: 'public' })
    tx(x => lib.setTeacherShare(x, row.id, t.userId, 'members'))
    holdBy(row.id, 'admin')
    const sharing = lib.presentAdminSermon(load(row.id)).sharing
    expect(sharing.teacherShare).toBe('members')
    expect(sharing.holds.map(h => h.party)).toEqual(['admin'])
    expect(sharing.availability).toMatchObject({ audience: 'nobody', blockedBy: ['admin'], draft: false })
  })

  it('does not put sharing into what the public sees of a message', () => {
    const row = message()
    holdBy(row.id, 'pastor')
    expect(JSON.stringify(lib.presentSermon(load(row.id)))).not.toMatch(/sharing|hold|teacherShare/)
  })
})

describe('who has the right to pause', () => {
  const may = (role: keyof typeof roles, party: HoldParty) => roles[role].authorize({ sermonHold: [party] } as never).success

  it('is the pastor for the pastor’s pause and an administrator for theirs, and no one for the other’s', () => {
    expect(may('pastor', 'pastor')).toBe(true)
    expect(may('pastor', 'admin')).toBe(false)
    expect(may('admin', 'admin')).toBe(true)
    expect(may('admin', 'pastor')).toBe(false)
  })

  it.each(['user', 'member', 'contentEditor', 'directoryManager', 'deacon', 'churchSecretary', 'treasurer', 'counter', 'financeCommittee'] as const)('is not given to the %s role', (role) => {
    for (const party of HOLD_PARTIES) expect(may(role, party)).toBe(false)
  })
})
