// Notifications, against a throwaway SQLite database. The risk is access: who may
// send, who is reached, who may read what, and that a person's log is theirs alone.
// See docs/specs/push-notifications.md.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { channelInputSchema, notificationSettingsSchema, readInputSchema, sendInputSchema, taskNotifyInputSchema } from '../../shared/notifications'

const sendMail = vi.fn()
vi.mock('../../server/lib/mail', async (original) => ({
  ...(await original<typeof import('../../server/lib/mail')>()),
  sendMailInBackground: (message: unknown) => sendMail(message),
}))

const dir = mkdtempSync(join(tmpdir(), 'lifegate-notifications-'))
process.env.DATABASE_PATH = join(dir, 'test.db')
process.env.BETTER_AUTH_URL = 'https://church.example'

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let lib: typeof import('../../server/lib/notifications')
let settings: typeof import('../../server/lib/notification-settings')
let listsLib: typeof import('../../server/lib/ministry-lists')
let ministriesLib: typeof import('../../server/lib/ministries')
let orm: typeof import('drizzle-orm')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  lib = await import('../../server/lib/notifications')
  settings = await import('../../server/lib/notification-settings')
  listsLib = await import('../../server/lib/ministry-lists')
  ministriesLib = await import('../../server/lib/ministries')
  orm = await import('drizzle-orm')
  // The gap between messages has its own tests; the rest send several in a row.
  tx(t => settings.updateNotificationSettings(t, { ...settings.loadNotificationSettings(t), minGapSeconds: 0 }))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))
beforeEach(() => sendMail.mockClear())

let counter = 0
const unique = () => `${++counter}`
const tx = <T>(fn: (t: Parameters<Parameters<typeof db.transaction>[0]>[0]) => T) => db.transaction(fn)

const statusOf = (fn: () => unknown) => {
  try {
    fn()
  }
  catch (error) {
    return (error as { statusCode?: number }).statusCode
  }
  return undefined
}

const newMinistry = (name = `Ministry ${unique()}`) =>
  tx(t => ministriesLib.createMinistry(t, { name, description: 'A test ministry.' }))

// A person with a sign-in account, who may serve in ministries.
const newAccount = (first: string, options: { email?: string, kind?: 'member' | 'guest', account?: boolean } = {}) => {
  const n = unique()
  const person = db.insert(schema.people).values({ firstName: first, lastName: `Test${n}`, kind: options.kind ?? 'member' }).returning().get()
  if (options.account === false) return { person, userId: null as string | null, email: null as string | null }
  const now = new Date()
  const email = options.email ?? `${first.toLowerCase()}${n}@example.org`
  const account = db.insert(schema.user).values({ id: `user-${n}`, name: first, email, emailVerified: true, createdAt: now, updatedAt: now }).returning().get()
  db.update(schema.people).set({ userId: account.id }).where(orm.eq(schema.people.id, person.id)).run()
  return { person, userId: account.id, email }
}

const serve = (ministryId: string, personId: string, leader = false) =>
  db.insert(schema.ministryMembers).values({ ministryId, personId, isLeader: leader }).run()

const viewerFor = (userId: string, member = true) => lib.loadNotifyViewer(userId, member)

const channelOf = (ministryId: string | null, name?: string) => {
  const rows = db.select().from(schema.notificationChannels)
    .where(ministryId ? orm.eq(schema.notificationChannels.ministryId, ministryId) : orm.isNull(schema.notificationChannels.ministryId)).all()
  return name ? rows.find(row => row.name === name)! : rows[0]!
}

const setLimit = (maxPerDay: number, keepDays = 90) =>
  tx(t => settings.updateNotificationSettings(t, { ...settings.loadNotificationSettings(t), maxPerDay, keepDays }))

// A ministry with a leader, two members, someone without an account, and an outsider.
const scenario = () => {
  const ministryId = newMinistry()
  const leader = newAccount('Lead')
  const ann = newAccount('Ann')
  const bob = newAccount('Bob')
  const noAccount = newAccount('Nosignin', { account: false })
  const outsider = newAccount('Out')
  serve(ministryId, leader.person.id, true)
  serve(ministryId, ann.person.id)
  serve(ministryId, bob.person.id)
  serve(ministryId, noAccount.person.id)
  const otherMinistry = newMinistry()
  serve(otherMinistry, outsider.person.id)
  const channel = channelOf(ministryId)
  return { ministryId, otherMinistry, leader, ann, bob, noAccount, outsider, channel }
}

const message = { title: 'Setup moved', body: 'We start at 8 this Sunday.', url: null }

// ---------------------------------------------------------------------------

describe('what is seeded', () => {
  it('gives every ministry a General channel, the ones that existed and the ones made since', () => {
    const made = newMinistry()
    expect(channelOf(made)).toMatchObject({ name: 'General' })
    const everyMinistry = db.select({ id: schema.ministries.id }).from(schema.ministries).all()
    for (const { id } of everyMinistry) expect(channelOf(id)?.name).toBe('General')
  })

  it('starts with one church-wide channel, and neutral message settings', () => {
    expect(channelOf(null)).toMatchObject({ name: 'Church announcements', ministryId: null })
    expect(settings.loadNotificationSettings()).toEqual({ maxPerDay: 5, keepDays: 90, minGapSeconds: 0, quietStart: '21:00', quietEnd: '07:00', senderUserIds: [] })
    // The gap was switched off for these tests; what a new database starts with is 30 seconds.
    const column = (db as unknown as { $client: { prepare: (sql: string) => { get: () => { dflt_value: string } } } }).$client
      .prepare("select dflt_value from pragma_table_info('site_settings') where name = 'notify_min_gap_seconds'").get()
    expect(column.dflt_value).toBe('30')
  })
})

describe('who may see, send to and manage a channel', () => {
  const ministry = (over = {}) => ({ ministryId: 'm1', archivedAt: null, ...over })
  const viewer = (over: Partial<import('../../server/lib/notifications').NotifyViewer> = {}): import('../../server/lib/notifications').NotifyViewer => ({
    userId: 'u', personId: 'p', assignedLists: new Set(), serves: new Set(), leads: new Set(), staffView: false, staffViewLeadersOnly: false,
    isMember: true, isChurchSender: false, ...over,
  })

  it.each([
    ['a leader', { serves: new Set(['m1']), leads: new Set(['m1']) }, true, true, true],
    ['a member serving there', { serves: new Set(['m1']) }, true, false, false],
    ['a member of another ministry', { serves: new Set(['m2']), leads: new Set(['m2']) }, false, false, false],
    ['staff, who serve nowhere', { staffView: true, staffViewLeadersOnly: true }, false, false, false],
    ['a church announcer', { isChurchSender: true }, false, false, false],
  ] as const)('%s: see %s / send %s / manage %s', (_who, over, see, send, manage) => {
    const v = viewer(over)
    expect(lib.canSeeChannel(v, ministry())).toBe(see)
    expect(lib.canSendTo(v, ministry())).toBe(send)
    expect(lib.canManageChannels(v, 'm1')).toBe(manage)
  })

  it('lets every member see the church-wide channels, and only announcers send to them', () => {
    const church = { ministryId: null, archivedAt: null }
    expect(lib.canSeeChannel(viewer(), church)).toBe(true)
    expect(lib.canSendTo(viewer(), church)).toBe(false)
    expect(lib.canSendTo(viewer({ isChurchSender: true }), church)).toBe(true)
    expect(lib.canSeeChannel(viewer({ isMember: false }), church)).toBe(false)
  })

  it('takes nothing for a retired channel', () => {
    expect(lib.canSendTo(viewer({ serves: new Set(['m1']), leads: new Set(['m1']) }), ministry({ archivedAt: new Date() }))).toBe(false)
  })

  it('does not make a church announcer of someone who is not a member', () => {
    const s = scenario()
    db.insert(schema.churchNotificationSenders).values({ userId: s.outsider.userId! }).run()
    expect(lib.loadNotifyViewer(s.outsider.userId!, true).isChurchSender).toBe(true)
    expect(lib.loadNotifyViewer(s.outsider.userId!, false).isChurchSender).toBe(false)
  })
})

describe('channels', () => {
  it('shows a ministry’s channels to the people serving there, and to no one else', () => {
    const s = scenario()
    expect(lib.loadMinistryChannels(viewerFor(s.ann.userId!), s.ministryId).channels.map(c => c.name)).toEqual(['General'])
    expect(statusOf(() => lib.loadMinistryChannels(viewerFor(s.outsider.userId!), s.ministryId))).toBe(404)
  })

  it('lets leaders add, rename and retire channels, and members do none of it', () => {
    const s = scenario()
    const lead = viewerFor(s.leader.userId!)
    const id = tx(t => lib.createChannel(t, lead, s.ministryId, { name: 'Prayer', description: 'Requests' }))
    expect(lib.loadMinistryChannels(lead, s.ministryId).channels.map(c => c.name)).toEqual(['General', 'Prayer'])

    tx(t => lib.updateChannel(t, lead, id, { name: 'Prayer requests' }))
    expect(db.select().from(schema.notificationChannels).where(orm.eq(schema.notificationChannels.id, id)).get()!.name).toBe('Prayer requests')

    tx(t => lib.updateChannel(t, lead, id, { archived: true }))
    expect(lib.loadMinistryChannels(lead, s.ministryId).channels.find(c => c.id === id)?.archived).toBe(true)
    // A member does not see a retired channel, and a leader does.
    expect(lib.loadMinistryChannels(viewerFor(s.ann.userId!), s.ministryId).channels.map(c => c.name)).toEqual(['General'])

    const member = viewerFor(s.ann.userId!)
    expect(statusOf(() => tx(t => lib.createChannel(t, member, s.ministryId, { name: 'Nope', description: '' })))).toBe(403)
    expect(statusOf(() => tx(t => lib.updateChannel(t, member, id, { name: 'Nope' })))).toBe(403)
  })

  it('does not confirm a ministry’s channels to someone with no part in it', () => {
    const s = scenario()
    expect(statusOf(() => tx(t => lib.updateChannel(t, viewerFor(s.outsider.userId!), s.channel.id, { name: 'Hijack' })))).toBe(404)
    expect(statusOf(() => tx(t => lib.createChannel(t, viewerFor(s.outsider.userId!), s.ministryId, { name: 'Hijack', description: '' })))).toBe(403)
  })

  it('refuses a second channel of the same name, whatever the case, but not one that was retired', () => {
    const s = scenario()
    const lead = viewerFor(s.leader.userId!)
    expect(statusOf(() => tx(t => lib.createChannel(t, lead, s.ministryId, { name: 'general', description: '' })))).toBe(409)
    const id = tx(t => lib.createChannel(t, lead, s.ministryId, { name: 'Rota', description: '' }))
    tx(t => lib.updateChannel(t, lead, id, { archived: true }))
    expect(() => tx(t => lib.createChannel(t, lead, s.ministryId, { name: 'Rota', description: '' }))).not.toThrow()
  })

  it('keeps the church-wide channels apart from a ministry’s', () => {
    const id = tx(t => lib.createChurchChannel(t, { name: 'Weather closures', description: '' }))
    expect(lib.loadChurchChannels().map(c => c.name)).toContain('Weather closures')
    tx(t => lib.updateChurchChannel(t, id, { archived: true }))
    const s = scenario()
    expect(statusOf(() => tx(t => lib.updateChurchChannel(t, s.channel.id, { name: 'Taken' })))).toBe(404)
  })

  it('lists what a person might receive: their ministries and the church-wide ones, not others’', () => {
    const s = scenario()
    const mine = lib.loadMyChannels(viewerFor(s.ann.userId!))
    expect(mine.some(c => c.id === s.channel.id)).toBe(true)
    expect(mine.some(c => c.ministry === null)).toBe(true)
    expect(mine.some(c => c.ministry && c.ministry.name !== mine.find(x => x.id === s.channel.id)!.ministry!.name)).toBe(false)
    expect(lib.loadMyChannels(viewerFor(s.outsider.userId!)).some(c => c.id === s.channel.id)).toBe(false)
    expect(lib.loadMyChannels(viewerFor(s.ann.userId!, false))).toEqual([])
    expect(mine.every(c => !c.archived)).toBe(true)
  })

  it('follows by default, and muting is one person’s own', () => {
    const s = scenario()
    const ann = viewerFor(s.ann.userId!)
    expect(lib.loadMyChannels(ann).find(c => c.id === s.channel.id)!.following).toBe(true)
    tx(t => lib.setFollowing(t, ann, s.channel.id, false))
    expect(lib.loadMyChannels(ann).find(c => c.id === s.channel.id)!.following).toBe(false)
    expect(lib.loadMyChannels(viewerFor(s.bob.userId!)).find(c => c.id === s.channel.id)!.following).toBe(true)
    tx(t => lib.setFollowing(t, ann, s.channel.id, true))
    expect(lib.loadMyChannels(ann).find(c => c.id === s.channel.id)!.following).toBe(true)
  })

  it('does not let someone follow, or mute, a channel they cannot see', () => {
    const s = scenario()
    expect(statusOf(() => tx(t => lib.setFollowing(t, viewerFor(s.outsider.userId!), s.channel.id, false)))).toBe(404)
  })
})

describe('sending', () => {
  it('reaches the people on the roster who have an account and have not muted it, but not the sender', () => {
    const s = scenario()
    tx(t => lib.setFollowing(t, viewerFor(s.bob.userId!), s.channel.id, false))
    const result = tx(t => lib.sendToChannel(t, viewerFor(s.leader.userId!), s.channel.id, message))
    expect(result.recipients).toBe(1)
    const receipts = db.select().from(schema.notificationReceipts).where(orm.eq(schema.notificationReceipts.notificationId, result.id)).all()
    expect(receipts.map(r => r.userId)).toEqual([s.ann.userId])
  })

  it('does not reach someone who is not on the roster, nor a person with no account', () => {
    const s = scenario()
    const result = tx(t => lib.sendToChannel(t, viewerFor(s.leader.userId!), s.channel.id, message))
    const reached = db.select().from(schema.notificationReceipts).where(orm.eq(schema.notificationReceipts.notificationId, result.id)).all().map(r => r.userId)
    expect(reached.sort()).toEqual([s.ann.userId, s.bob.userId].sort())
    expect(reached).not.toContain(s.outsider.userId)
  })

  it('lets a leader send, and nobody else in the ministry', () => {
    const s = scenario()
    expect(statusOf(() => tx(t => lib.sendToChannel(t, viewerFor(s.ann.userId!), s.channel.id, message)))).toBe(403)
    expect(statusOf(() => tx(t => lib.sendToChannel(t, viewerFor(s.outsider.userId!), s.channel.id, message)))).toBe(404)
    expect(statusOf(() => tx(t => lib.sendToChannel(t, viewerFor(s.leader.userId!), 'no-such-channel', message)))).toBe(404)
  })

  // Authority is read from the roster each time, so naming a new leader hands it over.
  it('takes the right to send from a leader who is replaced, and gives it to the new one', () => {
    const s = scenario()
    db.update(schema.ministryMembers).set({ isLeader: false }).where(orm.and(orm.eq(schema.ministryMembers.ministryId, s.ministryId), orm.eq(schema.ministryMembers.personId, s.leader.person.id))).run()
    db.update(schema.ministryMembers).set({ isLeader: true }).where(orm.and(orm.eq(schema.ministryMembers.ministryId, s.ministryId), orm.eq(schema.ministryMembers.personId, s.ann.person.id))).run()
    expect(statusOf(() => tx(t => lib.sendToChannel(t, viewerFor(s.leader.userId!), s.channel.id, message)))).toBe(403)
    expect(() => tx(t => lib.sendToChannel(t, viewerFor(s.ann.userId!), s.channel.id, message))).not.toThrow()
  })

  it('stops reaching someone who has left the ministry', () => {
    const s = scenario()
    db.delete(schema.ministryMembers).where(orm.and(orm.eq(schema.ministryMembers.ministryId, s.ministryId), orm.eq(schema.ministryMembers.personId, s.bob.person.id))).run()
    const result = tx(t => lib.sendToChannel(t, viewerFor(s.leader.userId!), s.channel.id, message))
    expect(db.select().from(schema.notificationReceipts).where(orm.eq(schema.notificationReceipts.notificationId, result.id)).all().map(r => r.userId)).toEqual([s.ann.userId])
  })

  it('refuses a retired channel', () => {
    const s = scenario()
    const lead = viewerFor(s.leader.userId!)
    const id = tx(t => lib.createChannel(t, lead, s.ministryId, { name: 'Old', description: '' }))
    tx(t => lib.updateChannel(t, lead, id, { archived: true }))
    expect(statusOf(() => tx(t => lib.sendToChannel(t, lead, id, message)))).toBe(409)
  })

  it('opens the ministry’s page by default, and a page the leader chose', () => {
    const s = scenario()
    const lead = viewerFor(s.leader.userId!)
    const slug = db.select({ slug: schema.ministries.slug }).from(schema.ministries).where(orm.eq(schema.ministries.id, s.ministryId)).get()!.slug
    const first = tx(t => lib.sendToChannel(t, lead, s.channel.id, message))
    expect(db.select().from(schema.notifications).where(orm.eq(schema.notifications.id, first.id)).get()!.url).toBe(`/ministries/${slug}`)
    const second = tx(t => lib.sendToChannel(t, lead, s.channel.id, { ...message, url: '/calendar' }))
    expect(db.select().from(schema.notifications).where(orm.eq(schema.notifications.id, second.id)).get()!.url).toBe('/calendar')
  })

  describe('the daily limit', () => {
    it('stops a channel at the limit, counts per channel, and starts again the next church day', () => {
      const s = scenario()
      const lead = viewerFor(s.leader.userId!)
      const other = tx(t => lib.createChannel(t, lead, s.ministryId, { name: 'Other', description: '' }))
      setLimit(2)
      const now = new Date('2026-10-24T16:00:00Z')
      tx(t => lib.sendToChannel(t, lead, s.channel.id, message, now))
      tx(t => lib.sendToChannel(t, lead, s.channel.id, message, now))
      expect(statusOf(() => tx(t => lib.sendToChannel(t, lead, s.channel.id, message, now)))).toBe(429)
      // Another channel of the same ministry has its own count.
      expect(() => tx(t => lib.sendToChannel(t, lead, other, message, now))).not.toThrow()
      // And tomorrow the first one is open again.
      expect(() => tx(t => lib.sendToChannel(t, lead, s.channel.id, message, new Date('2026-10-25T16:00:00Z')))).not.toThrow()
      setLimit(5)
    })

    it('counts a day in the church’s time zone, not UTC', () => {
      // 23:30 on the 23rd in Detroit is already the 24th in UTC.
      expect(lib.startOfChurchDay(new Date('2026-10-24T03:30:00Z')).toISOString()).toBe('2026-10-23T04:00:00.000Z')
      expect(lib.startOfChurchDay(new Date('2026-10-24T05:30:00Z')).toISOString()).toBe('2026-10-24T04:00:00.000Z')
    })

    it('reports how many are left to leaders', () => {
      const s = scenario()
      const lead = viewerFor(s.leader.userId!)
      setLimit(3)
      const now = new Date('2026-10-24T16:00:00Z')
      tx(t => lib.sendToChannel(t, lead, s.channel.id, message, now))
      const sent = lib.loadSent(lead, { ministryId: s.ministryId }, now)
      expect(sent.limit).toBe(3)
      expect(sent.usedToday[s.channel.id]).toBe(1)
      setLimit(5)
    })
  })

  describe('the gap between messages', () => {
    const withGap = (seconds: number) => tx(t => settings.updateNotificationSettings(t, { ...settings.loadNotificationSettings(t), minGapSeconds: seconds }))

    it('makes a channel wait between messages, and reports how long', () => {
      const s = scenario()
      const lead = viewerFor(s.leader.userId!)
      withGap(30)
      const t0 = new Date('2026-10-24T16:00:00Z')
      tx(t => lib.sendToChannel(t, lead, s.channel.id, message, t0))
      const early = (seconds: number) => statusOf(() => tx(t => lib.sendToChannel(t, lead, s.channel.id, message, new Date(t0.getTime() + seconds * 1000))))
      expect(early(0)).toBe(429)
      expect(early(29)).toBe(429)
      expect(() => tx(t => lib.sendToChannel(t, lead, s.channel.id, message, new Date(t0.getTime() + 30_000)))).not.toThrow()
      withGap(0)
    })

    it('says how many seconds are left', () => {
      const s = scenario()
      const lead = viewerFor(s.leader.userId!)
      withGap(30)
      const t0 = new Date('2026-10-24T16:00:00Z')
      tx(t => lib.sendToChannel(t, lead, s.channel.id, message, t0))
      expect(lib.waitBeforeNext(db, s.channel.id, new Date(t0.getTime() + 10_000), 30)).toBe(20)
      expect(lib.waitBeforeNext(db, s.channel.id, new Date(t0.getTime() + 30_000), 30)).toBe(0)
      let wording = ''
      try { tx(t => lib.sendToChannel(t, lead, s.channel.id, message, new Date(t0.getTime() + 10_000))) }
      catch (error) { wording = (error as { statusMessage: string }).statusMessage }
      expect(wording).toBe('Please wait 20 seconds before sending another message to this channel.')
      withGap(0)
    })

    it('counts each channel on its own, and is off at zero', () => {
      const s = scenario()
      const lead = viewerFor(s.leader.userId!)
      const other = tx(t => lib.createChannel(t, lead, s.ministryId, { name: 'Second', description: '' }))
      withGap(30)
      const now = new Date('2026-10-24T16:00:00Z')
      tx(t => lib.sendToChannel(t, lead, s.channel.id, message, now))
      expect(() => tx(t => lib.sendToChannel(t, lead, other, message, now))).not.toThrow()
      withGap(0)
      expect(() => tx(t => lib.sendToChannel(t, lead, s.channel.id, message, now))).not.toThrow()
    })

    it('keeps messages in the order they were sent, whatever the gap', () => {
      const s = scenario()
      const lead = viewerFor(s.leader.userId!)
      const at = new Date('2026-10-24T16:00:00Z')
      for (const title of ['One', 'Two', 'Three']) tx(t => lib.sendToChannel(t, lead, s.channel.id, { ...message, title }, at))
      expect(lib.loadLog(viewerFor(s.ann.userId!), at).notifications.map(n => n.title)).toEqual(['Three', 'Two', 'One'])
      expect(lib.loadSent(lead, { ministryId: s.ministryId }, at).sent.map(m => m.title)).toEqual(['Three', 'Two', 'One'])
    })
  })

  describe('who a ministry can reach', () => {
    it('marks who has an account, for the leaders, and counts those who are not listed', () => {
      const s = scenario()
      const hidden = newAccount('Private')
      db.insert(schema.ministryMembers).values({ ministryId: s.ministryId, personId: hidden.person.id, showToMembers: false }).run()
      const audience = lib.loadMinistryChannels(viewerFor(s.leader.userId!), s.ministryId).audience!
      const byName = Object.fromEntries(audience.people.map(p => [p.name.split(' ')[0], p.canReceive]))
      expect(byName).toMatchObject({ Ann: true, Bob: true, Lead: true, Nosignin: false })
      // Someone who asked not to be listed is not named, but still receives messages and is counted.
      expect(audience.people.some(p => p.name.startsWith('Private'))).toBe(false)
      // On the roster: the leader, Ann, Bob, the person with no account, and Private.
      expect(audience.total).toBe(5)
      expect(audience.reachable).toBe(4)
    })

    it('is for the leaders only, never for members or anyone else', () => {
      const s = scenario()
      expect(lib.loadMinistryChannels(viewerFor(s.ann.userId!), s.ministryId).audience).toBeNull()
      expect(statusOf(() => lib.loadMinistryChannels(viewerFor(s.outsider.userId!), s.ministryId))).toBe(404)
    })

    it('marks the same people in the list a leader gives tasks from', () => {
      const s = scenario()
      const options = listsLib.loadAssignable(s.ministryId)
      expect(options.find(o => o.name.startsWith('Ann'))!.canNotify).toBe(true)
      expect(options.find(o => o.name.startsWith('Nosignin'))!.canNotify).toBe(false)
    })
  })

  describe('the church-wide channel', () => {
    it('is sent only by the chosen announcers, to every member with an account', () => {
      const s = scenario()
      const announcer = newAccount('Announcer')
      tx(t => settings.updateNotificationSettings(t, { ...settings.loadNotificationSettings(t), senderUserIds: [announcer.userId!] }))
      const church = channelOf(null)
      expect(statusOf(() => tx(t => lib.sendToChannel(t, viewerFor(s.leader.userId!), church.id, message)))).toBe(403)
      const result = tx(t => lib.sendToChannel(t, viewerFor(announcer.userId!), church.id, message))
      expect(result.recipients).toBeGreaterThanOrEqual(5)
      const reached = db.select().from(schema.notificationReceipts).where(orm.eq(schema.notificationReceipts.notificationId, result.id)).all().map(r => r.userId)
      expect(reached).toContain(s.ann.userId)
      expect(reached).toContain(s.outsider.userId)
      expect(reached).not.toContain(announcer.userId)
      expect(db.select().from(schema.notifications).where(orm.eq(schema.notifications.id, result.id)).get()!.url).toBe('/me?tab=notifications')
      tx(t => settings.updateNotificationSettings(t, { ...settings.loadNotificationSettings(t), senderUserIds: [] }))
    })

    it('does not let an announcer see another ministry’s channel', () => {
      const s = scenario()
      const announcer = newAccount('Announcer2')
      tx(t => settings.updateNotificationSettings(t, { ...settings.loadNotificationSettings(t), senderUserIds: [announcer.userId!] }))
      expect(statusOf(() => tx(t => lib.sendToChannel(t, viewerFor(announcer.userId!), s.channel.id, message)))).toBe(404)
      tx(t => settings.updateNotificationSettings(t, { ...settings.loadNotificationSettings(t), senderUserIds: [] }))
    })
  })

  describe('what a leader sees afterwards', () => {
    it('is how many it reached and how many read it, never who', () => {
      const s = scenario()
      const lead = viewerFor(s.leader.userId!)
      const sent = tx(t => lib.sendToChannel(t, lead, s.channel.id, message))
      tx(t => lib.markRead(t, s.ann.userId!, { ids: [sent.id] }))
      const view = lib.loadSent(lead, { ministryId: s.ministryId })
      expect(view.sent[0]).toMatchObject({ id: sent.id, title: message.title, recipients: 2, read: 1 })
      const text = JSON.stringify(view)
      expect(text).not.toContain(s.ann.userId!)
      expect(text).not.toContain('Ann')
    })

    it('is for the leaders, not the members, staff or announcers of another ministry', () => {
      const s = scenario()
      expect(statusOf(() => lib.loadSent(viewerFor(s.ann.userId!), { ministryId: s.ministryId }))).toBe(403)
      expect(statusOf(() => lib.loadSent(viewerFor(s.outsider.userId!), { ministryId: s.ministryId }))).toBe(403)
      expect(statusOf(() => lib.loadSent(viewerFor(s.ann.userId!), { churchWide: true }))).toBe(403)
    })
  })
})

describe('what is allowed in a message', () => {
  it('keeps a title and message short enough for a lock screen', () => {
    expect(sendInputSchema.safeParse({ title: 'x'.repeat(60), body: 'y'.repeat(200) }).success).toBe(true)
    expect(sendInputSchema.safeParse({ title: 'x'.repeat(61), body: 'y' }).success).toBe(false)
    expect(sendInputSchema.safeParse({ title: 'x', body: 'y'.repeat(201) }).success).toBe(false)
    expect(sendInputSchema.safeParse({ title: ' ', body: 'y' }).success).toBe(false)
    expect(sendInputSchema.safeParse({ title: 'x', body: '' }).success).toBe(false)
  })

  it.each(['/calendar', '/ministries/nursery', '/me?tab=notifications', '/people/abc#top'])('opens %s on this site', (url) => {
    expect(sendInputSchema.parse({ title: 't', body: 'b', url }).url).toBe(url)
  })

  it.each(['https://evil.example/', '//evil.example', 'javascript:alert(1)', 'calendar', 'mailto:a@b.c', '/a b', '/<script>'])('refuses the link %s', (url) => {
    expect(sendInputSchema.safeParse({ title: 't', body: 'b', url }).success).toBe(false)
  })

  it('treats a missing or empty link as the default', () => {
    expect(sendInputSchema.parse({ title: 't', body: 'b' }).url).toBeNull()
    expect(sendInputSchema.parse({ title: 't', body: 'b', url: '' }).url).toBeNull()
  })

  it('needs a channel to have a name', () => {
    expect(channelInputSchema.safeParse({ name: ' ' }).success).toBe(false)
    expect(channelInputSchema.safeParse({ name: 'x'.repeat(41) }).success).toBe(false)
    expect(channelInputSchema.parse({ name: ' News ' })).toEqual({ name: 'News', description: '' })
  })

  it('needs to be told which notifications to mark read', () => {
    expect(readInputSchema.safeParse({}).success).toBe(false)
    expect(readInputSchema.safeParse({ all: true }).success).toBe(true)
    expect(readInputSchema.safeParse({ ids: ['a'] }).success).toBe(true)
  })
})

describe('a person’s log', () => {
  it('holds what was sent to them, newest first, and nothing sent to others', () => {
    const s = scenario()
    const lead = viewerFor(s.leader.userId!)
    tx(t => lib.sendToChannel(t, lead, s.channel.id, { ...message, title: 'First' }))
    tx(t => lib.sendToChannel(t, lead, s.channel.id, { ...message, title: 'Second' }))
    const ann = lib.loadLog(viewerFor(s.ann.userId!))
    expect(ann.notifications.map(n => n.title)).toEqual(['Second', 'First'])
    expect(ann.unread).toBe(2)
    expect(ann.notifications[0]!.from).toMatch(/ · General$/)
    // Not the sender's, not an outsider's, and not a person with no account.
    expect(lib.loadLog(lead).notifications).toEqual([])
    expect(lib.loadLog(viewerFor(s.outsider.userId!)).notifications).toEqual([])
  })

  it('is empty for someone who is not a member of the church', () => {
    const s = scenario()
    tx(t => lib.sendToChannel(t, viewerFor(s.leader.userId!), s.channel.id, message))
    expect(lib.loadLog(viewerFor(s.ann.userId!, false)).notifications).toEqual([])
  })

  it('marks read, one or all, and only the person’s own', () => {
    const s = scenario()
    const lead = viewerFor(s.leader.userId!)
    const a = tx(t => lib.sendToChannel(t, lead, s.channel.id, message))
    const b = tx(t => lib.sendToChannel(t, lead, s.channel.id, message))
    const ann = viewerFor(s.ann.userId!)
    expect(tx(t => lib.markRead(t, s.ann.userId!, { ids: [a.id] }))).toBe(1)
    expect(lib.loadLog(ann).unread).toBe(1)
    // Someone who was not sent it cannot mark it, and Ann marking one twice changes nothing.
    expect(tx(t => lib.markRead(t, s.outsider.userId!, { ids: [b.id] }))).toBe(0)
    expect(tx(t => lib.markRead(t, s.outsider.userId!, { all: true }))).toBe(0)
    expect(lib.loadLog(ann).unread).toBe(1)
    expect(tx(t => lib.markRead(t, s.ann.userId!, { ids: [a.id] }))).toBe(0)
    expect(lib.loadLog(viewerFor(s.bob.userId!)).unread).toBe(2)
    expect(tx(t => lib.markRead(t, s.ann.userId!, { all: true }))).toBe(1)
    expect(lib.loadLog(ann).unread).toBe(0)
    expect(lib.loadLog(ann).notifications.find(n => n.id === b.id)!.read).toBe(true)
  })

  // Never let someone read what they can no longer see.
  it('hides what came from a ministry the person has left, and shows it again if they return', () => {
    const s = scenario()
    tx(t => lib.sendToChannel(t, viewerFor(s.leader.userId!), s.channel.id, message))
    expect(lib.loadLog(viewerFor(s.bob.userId!)).notifications).toHaveLength(1)
    db.delete(schema.ministryMembers).where(orm.and(orm.eq(schema.ministryMembers.ministryId, s.ministryId), orm.eq(schema.ministryMembers.personId, s.bob.person.id))).run()
    const away = lib.loadLog(viewerFor(s.bob.userId!))
    expect(away.notifications).toEqual([])
    expect(away.unread).toBe(0)
    serve(s.ministryId, s.bob.person.id)
    expect(lib.loadLog(viewerFor(s.bob.userId!)).notifications).toHaveLength(1)
  })

  it('keeps messages for the retention period, then drops them', () => {
    const s = scenario()
    const lead = viewerFor(s.leader.userId!)
    setLimit(5, 7)
    const sent = tx(t => lib.sendToChannel(t, lead, s.channel.id, message, new Date('2026-10-01T16:00:00Z')))
    const insideWeek = new Date('2026-10-07T16:00:00Z')
    const afterWeek = new Date('2026-10-09T16:00:00Z')
    expect(lib.loadLog(viewerFor(s.ann.userId!), insideWeek).notifications.map(n => n.id)).toContain(sent.id)
    expect(lib.loadLog(viewerFor(s.ann.userId!), afterWeek).notifications.map(n => n.id)).not.toContain(sent.id)
    expect(lib.loadLog(viewerFor(s.ann.userId!), afterWeek).keepDays).toBe(7)
    // And the rows themselves go, receipts with them.
    tx(t => lib.purgeExpired(t, afterWeek, true))
    expect(db.select().from(schema.notifications).where(orm.eq(schema.notifications.id, sent.id)).get()).toBeUndefined()
    expect(db.select().from(schema.notificationReceipts).where(orm.eq(schema.notificationReceipts.notificationId, sent.id)).all()).toEqual([])
    setLimit(5, 90)
  })
})

describe('a task given to someone', () => {
  const setup = (ministryMode?: 'email' | 'message' | 'both') => {
    const s = scenario()
    const lead = viewerFor(s.leader.userId!)
    if (ministryMode) tx(t => lib.setMinistryTaskNotify(t, lead, s.ministryId, ministryMode))
    const listId = tx(t => listsLib.createList(t, listsLib.loadListViewer(s.leader.userId!, { isMember: true, staffView: false, staffViewLeadersOnly: false }), s.ministryId, { name: 'Setup tasks', kind: 'tasks', audience: 'ministry', ordered: false, assigneesSeeAll: false, taskNotify: null }))
    const item = (assigneeId: string | null) => db.insert(schema.ministryListItems).values({ listId, title: 'Unlock the hall for the secret meeting', assigneeId }).returning({ id: schema.ministryListItems.id }).get().id
    return { s, lead, listId, item }
  }

  it('is announced by email and by a message when the ministry says both, which is the start', () => {
    const { s, item } = setup()
    const told = lib.notifyTaskAssigned(db, item(s.ann.person.id), s.leader.person.id)
    expect(told).toEqual({ message: true, email: true, notice: null })
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ to: s.ann.email })
    expect(lib.loadLog(viewerFor(s.ann.userId!)).notifications[0]).toMatchObject({ kind: 'task', url: '/my-lists' })
  })

  it('says what happened and nothing of the task itself, by message or by email', () => {
    const { s, item } = setup()
    lib.notifyTaskAssigned(db, item(s.ann.person.id), s.leader.person.id)
    const entry = lib.loadLog(viewerFor(s.ann.userId!)).notifications[0]!
    expect(`${entry.title} ${entry.body}`).not.toMatch(/unlock|secret|hall/i)
    expect(JSON.stringify(sendMail.mock.calls[0]![0])).not.toMatch(/unlock|secret|hall/i)
    expect(entry.from).toMatch(/ · Tasks$/)
  })

  it.each([
    ['email', true, false],
    ['message', false, true],
    ['both', true, true],
  ] as const)('follows the ministry’s choice of %s', (mode, email, message) => {
    const { s, item } = setup(mode)
    expect(lib.notifyTaskAssigned(db, item(s.ann.person.id), s.leader.person.id)).toEqual({ email, message, notice: null })
    expect(sendMail).toHaveBeenCalledTimes(email ? 1 : 0)
    expect(lib.loadLog(viewerFor(s.ann.userId!)).notifications).toHaveLength(message ? 1 : 0)
  })

  it('lets a list choose differently from its ministry, and a list with no choice follows it', () => {
    const { s, listId, item } = setup('both')
    db.update(schema.ministryLists).set({ taskNotify: 'email' }).where(orm.eq(schema.ministryLists.id, listId)).run()
    expect(lib.notifyTaskAssigned(db, item(s.ann.person.id), s.leader.person.id)).toEqual({ email: true, message: false, notice: null })
    db.update(schema.ministryLists).set({ taskNotify: null }).where(orm.eq(schema.ministryLists.id, listId)).run()
    expect(lib.notifyTaskAssigned(db, item(s.bob.person.id), s.leader.person.id)).toEqual({ email: true, message: true, notice: null })
    expect(lib.taskNotifyFor('message', 'email')).toBe('message')
    expect(lib.taskNotifyFor(null, 'email')).toBe('email')
  })

  it('tells nobody who gave themselves the task, or who cannot sign in, or when it was never assigned', () => {
    const { s, item } = setup()
    expect(lib.notifyTaskAssigned(db, item(s.ann.person.id), s.ann.person.id)).toEqual({ message: false, email: false, notice: null })
    expect(lib.notifyTaskAssigned(db, item(s.noAccount.person.id), s.leader.person.id)).toMatchObject({ message: false, email: false })
    expect(lib.notifyTaskAssigned(db, item(null), s.leader.person.id)).toEqual({ message: false, email: false, notice: null })
    expect(sendMail).not.toHaveBeenCalled()
  })

  // The leader should hear it, rather than think the person knows.
  it('tells the leader when the person given the task has no account, and says nothing otherwise', () => {
    const { s, item } = setup()
    const missed = lib.notifyTaskAssigned(db, item(s.noAccount.person.id), s.leader.person.id)
    expect(missed.notice).toMatch(/Nosignin has no sign-in account/)
    expect(missed.notice).toMatch(/will not be told/)
    expect(lib.notifyTaskAssigned(db, item(s.ann.person.id), s.leader.person.id).notice).toBeNull()
    expect(lib.notifyTaskAssigned(db, item(s.ann.person.id), s.ann.person.id).notice).toBeNull()
  })

  it('goes only to the person given the task', () => {
    const { s, item } = setup()
    lib.notifyTaskAssigned(db, item(s.ann.person.id), s.leader.person.id)
    expect(lib.loadLog(viewerFor(s.bob.userId!)).notifications).toEqual([])
    expect(lib.loadLog(viewerFor(s.leader.userId!)).notifications).toEqual([])
  })

  it('is hidden from the log once the person leaves the ministry', () => {
    const { s, item } = setup()
    lib.notifyTaskAssigned(db, item(s.ann.person.id), s.leader.person.id)
    db.delete(schema.ministryMembers).where(orm.and(orm.eq(schema.ministryMembers.ministryId, s.ministryId), orm.eq(schema.ministryMembers.personId, s.ann.person.id))).run()
    expect(lib.loadLog(viewerFor(s.ann.userId!)).notifications).toEqual([])
  })

  it('lets only the ministry’s leaders choose how tasks are announced', () => {
    const { s } = setup()
    expect(statusOf(() => tx(t => lib.setMinistryTaskNotify(t, viewerFor(s.ann.userId!), s.ministryId, 'email')))).toBe(403)
    expect(statusOf(() => tx(t => lib.setMinistryTaskNotify(t, viewerFor(s.outsider.userId!), s.ministryId, 'email')))).toBe(404)
    expect(lib.loadMinistryChannels(viewerFor(s.leader.userId!), s.ministryId).taskNotify).toBe('both')
    tx(t => lib.setMinistryTaskNotify(t, viewerFor(s.leader.userId!), s.ministryId, 'message'))
    expect(lib.loadMinistryChannels(viewerFor(s.leader.userId!), s.ministryId).taskNotify).toBe('message')
    expect(taskNotifyInputSchema.safeParse({ taskNotify: 'sms' }).success).toBe(false)
  })

  it('records a list’s own choice, only for tasks, and copies a routine’s into its runs of tasks', () => {
    const s = scenario()
    const lv = listsLib.loadListViewer(s.leader.userId!, { isMember: true, staffView: false, staffViewLeadersOnly: false })
    const tasks = tx(t => listsLib.createList(t, lv, s.ministryId, { name: 'T', kind: 'tasks', audience: 'ministry', ordered: false, assigneesSeeAll: false, taskNotify: 'message' }))
    const checklist = tx(t => listsLib.createList(t, lv, s.ministryId, { name: 'C', kind: 'list', audience: 'ministry', ordered: false, assigneesSeeAll: false, taskNotify: 'message' }))
    const row = (id: string) => db.select().from(schema.ministryLists).where(orm.eq(schema.ministryLists.id, id)).get()!
    expect(row(tasks).taskNotify).toBe('message')
    expect(row(checklist).taskNotify).toBeNull()

    tx(t => listsLib.updateList(t, lv, tasks, { taskNotify: 'email' }))
    expect(row(tasks).taskNotify).toBe('email')
    tx(t => listsLib.updateList(t, lv, tasks, { taskNotify: null }))
    expect(row(tasks).taskNotify).toBeNull()
    tx(t => listsLib.updateList(t, lv, checklist, { taskNotify: 'email' }))
    expect(row(checklist).taskNotify).toBeNull()

    const routine = tx(t => listsLib.createList(t, lv, s.ministryId, { name: 'R', kind: 'routine', audience: 'ministry', ordered: false, assigneesSeeAll: false, taskNotify: 'email' }))
    db.insert(schema.ministryListItems).values({ listId: routine, title: 'Step' }).run()
    const run = tx(t => listsLib.startRun(t, lv, routine, 'tasks', false))
    expect(row(run.id).taskNotify).toBe('email')
    const checklistRun = tx(t => listsLib.startRun(t, lv, routine, 'list', true))
    expect(row(checklistRun.id).taskNotify).toBeNull()
  })
})

describe('the message settings', () => {
  it('limits what can be set', () => {
    const ok = { maxPerDay: 5, keepDays: 90, minGapSeconds: 30, quietStart: '21:00', quietEnd: '07:00', senderUserIds: [] }
    expect(notificationSettingsSchema.safeParse(ok).success).toBe(true)
    for (const bad of [{ maxPerDay: 0 }, { maxPerDay: 51 }, { keepDays: 6 }, { keepDays: 366 }, { minGapSeconds: -1 }, { minGapSeconds: 3601 }, { quietStart: '9pm' }, { quietEnd: '25:00' }, { maxPerDay: 2.5 }]) {
      expect(notificationSettingsSchema.safeParse({ ...ok, ...bad }).success).toBe(false)
    }
  })

  it('names the fields that changed, and nothing when nothing did', () => {
    const current = settings.loadNotificationSettings()
    expect(tx(t => settings.updateNotificationSettings(t, current))).toEqual([])
    expect(tx(t => settings.updateNotificationSettings(t, { ...current, maxPerDay: 9, quietEnd: '06:30' }))).toEqual(['maxPerDay', 'quietEnd'])
    expect(settings.loadNotificationSettings()).toMatchObject({ maxPerDay: 9, quietEnd: '06:30' })
    tx(t => settings.updateNotificationSettings(t, current))
  })

  it('chooses announcers only from members who have an account, and replaces the set each time', () => {
    const a = newAccount('Alpha')
    const b = newAccount('Beta')
    const noAccount = newAccount('Nosign2', { account: false })
    const current = settings.loadNotificationSettings()
    expect(statusOf(() => tx(t => settings.updateNotificationSettings(t, { ...current, senderUserIds: ['not-a-user'] })))).toBe(400)
    expect(settings.listSenderCandidates().some(c => c.name.startsWith('Nosign2'))).toBe(false)
    expect(settings.listSenderCandidates().some(c => c.userId === a.userId)).toBe(true)
    expect(noAccount.userId).toBeNull()

    expect(tx(t => settings.updateNotificationSettings(t, { ...current, senderUserIds: [a.userId!, b.userId!] }))).toEqual(['senderUserIds'])
    expect(settings.loadNotificationSettings().senderUserIds).toEqual([a.userId, b.userId].sort())
    tx(t => settings.updateNotificationSettings(t, { ...current, senderUserIds: [b.userId!] }))
    expect(settings.loadNotificationSettings().senderUserIds).toEqual([b.userId])
    expect(lib.loadNotifyViewer(a.userId!, true).isChurchSender).toBe(false)
    tx(t => settings.updateNotificationSettings(t, { ...current, senderUserIds: [] }))
  })

  it('does not keep an announcer who is deleted', () => {
    const gone = newAccount('Gone')
    tx(t => settings.updateNotificationSettings(t, { ...settings.loadNotificationSettings(t), senderUserIds: [gone.userId!] }))
    db.delete(schema.user).where(orm.eq(schema.user.id, gone.userId!)).run()
    expect(settings.loadNotificationSettings().senderUserIds).toEqual([])
  })
})
