// Keys for the video host and YouTube, entered on Church details and kept encrypted.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-integrations-'))
process.env.DATABASE_PATH = join(dir, 'test.db')
process.env.BETTER_AUTH_SECRET = 'test-secret-for-the-integration-tests-0123456789'

let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let secrets: typeof import('../../server/lib/integration-secrets')
let settings: typeof import('../../server/lib/video-settings')
let bunny: typeof import('../../server/lib/bunny')
let yt: typeof import('../../server/lib/youtube')
let orm: typeof import('drizzle-orm')

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  secrets = await import('../../server/lib/integration-secrets')
  settings = await import('../../server/lib/video-settings')
  bunny = await import('../../server/lib/bunny')
  yt = await import('../../server/lib/youtube')
  orm = await import('drizzle-orm')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))
afterEach(() => {
  db.delete(schema.integrationSecrets).run()
  yt.deleteConnection()
  for (const name of ['BUNNY_LIBRARY_ID', 'BUNNY_API_KEY', 'BUNNY_TOKEN_KEY', 'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'BETTER_AUTH_URL']) delete process.env[name]
  process.env.BETTER_AUTH_SECRET = 'test-secret-for-the-integration-tests-0123456789'
})

const account = () => {
  const n = Math.random().toString(36).slice(2)
  const now = new Date()
  return db.insert(schema.user).values({ id: `is-${n}`, name: 'Admin', email: `${n}@example.org`, emailVerified: true, createdAt: now, updatedAt: now }).returning().get().id
}
const auditActions = () => db.select().from(schema.auditLog).all().map(entry => entry.action)

describe('keys entered on Church details', () => {
  it('are kept encrypted, so a copy of the database cannot read them', () => {
    settings.updateVideoSettings({ 'bunny.apiKey': 'super-secret-api-key', 'bunny.libraryId': '98765' }, account())
    const rows = db.select().from(schema.integrationSecrets).all()
    expect(rows).toHaveLength(2)
    expect(JSON.stringify(rows)).not.toContain('super-secret-api-key')
    expect(JSON.stringify(rows)).not.toContain('98765')
    expect(secrets.readIntegration('bunny.apiKey')).toEqual({ value: 'super-secret-api-key', source: 'ui' })
  })

  it('make the video host and YouTube work with no environment variables', () => {
    expect(bunny.bunnyConfig()).toBeNull()
    settings.updateVideoSettings({ 'bunny.libraryId': '123', 'bunny.apiKey': 'api', 'bunny.tokenKey': 'token' }, account())
    expect(bunny.bunnyConfig()).toEqual({ libraryId: '123', apiKey: 'api', tokenKey: 'token' })
    process.env.BETTER_AUTH_URL = 'https://church.example'
    settings.updateVideoSettings({ 'youtube.clientId': 'cid', 'youtube.clientSecret': 'csecret' }, account())
    expect(yt.youtubeConfig()).toMatchObject({ clientId: 'cid', clientSecret: 'csecret' })
  })

  it('win over the server’s environment, which still works when nothing was entered', () => {
    process.env.BUNNY_API_KEY = 'from-environment'
    expect(secrets.readIntegration('bunny.apiKey')).toEqual({ value: 'from-environment', source: 'env' })
    settings.updateVideoSettings({ 'bunny.apiKey': 'entered-here' }, account())
    expect(secrets.readIntegration('bunny.apiKey')).toEqual({ value: 'entered-here', source: 'ui' })
    settings.updateVideoSettings({ 'bunny.apiKey': null }, account())
    expect(secrets.readIntegration('bunny.apiKey')).toEqual({ value: 'from-environment', source: 'env' })
  })

  it('change only what was filled in: a blank or missing field is left alone', () => {
    settings.updateVideoSettings({ 'bunny.libraryId': '111', 'bunny.apiKey': 'keep-me' }, account())
    const result = settings.updateVideoSettings({ 'bunny.libraryId': '222', 'bunny.apiKey': '', 'bunny.tokenKey': undefined }, account())
    expect(result.changed).toEqual(['bunny.libraryId'])
    expect(secrets.readIntegration('bunny.libraryId').value).toBe('222')
    expect(secrets.readIntegration('bunny.apiKey').value).toBe('keep-me')
    expect(secrets.readIntegration('bunny.tokenKey')).toEqual({ value: null, source: null })
  })

  it('can be cleared, and clearing something that is not set changes nothing', () => {
    settings.updateVideoSettings({ 'bunny.tokenKey': 'token' }, account())
    expect(settings.updateVideoSettings({ 'bunny.tokenKey': null }, account()).changed).toEqual(['bunny.tokenKey'])
    expect(settings.updateVideoSettings({ 'bunny.tokenKey': null }, account()).changed).toEqual([])
    expect(secrets.readIntegration('bunny.tokenKey').source).toBeNull()
  })

  it('show as unreadable, not as a crash, when the site’s own secret has changed', () => {
    settings.updateVideoSettings({ 'bunny.apiKey': 'api' }, account())
    process.env.BETTER_AUTH_SECRET = 'a-completely-different-site-secret-9876543210'
    expect(secrets.readIntegration('bunny.apiKey')).toEqual({ value: null, source: 'unreadable' })
    expect(bunny.bunnyConfig()).toBeNull()
  })
})

describe('what a screen is told', () => {
  it('never includes a secret, only whether it is set and from where', () => {
    settings.updateVideoSettings({ 'bunny.libraryId': '98765', 'bunny.apiKey': 'api-secret', 'bunny.tokenKey': 'token-secret', 'youtube.clientId': 'client-123.apps.example', 'youtube.clientSecret': 'client-secret' }, account())
    const view = secrets.integrationView()
    expect(view['bunny.libraryId']).toEqual({ source: 'ui', value: '98765' })
    expect(view['youtube.clientId']).toEqual({ source: 'ui', value: 'client-123.apps.example' })
    for (const name of ['bunny.apiKey', 'bunny.tokenKey', 'youtube.clientSecret'] as const) {
      expect(view[name]).toEqual({ source: 'ui', value: null })
    }
    expect(JSON.stringify(view)).not.toMatch(/api-secret|token-secret|client-secret/)
  })

  it('reports a value from the environment too, without its secret', () => {
    process.env.YOUTUBE_CLIENT_SECRET = 'env-secret'
    expect(secrets.integrationView()['youtube.clientSecret']).toEqual({ source: 'env', value: null })
  })
})

describe('the audit log', () => {
  it('records which fields changed, never their values', () => {
    const before = db.select().from(schema.auditLog).all().length
    settings.updateVideoSettings({ 'bunny.apiKey': 'must-not-appear', 'bunny.libraryId': '55' }, account())
    const entries = db.select().from(schema.auditLog).all().slice(before)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ action: 'site.integrations' })
    expect(entries[0]!.details.fields).toEqual(['bunny.libraryId', 'bunny.apiKey'])
    expect(JSON.stringify(entries)).not.toContain('must-not-appear')
  })

  it('records nothing when nothing changed', () => {
    const before = db.select().from(schema.auditLog).all().length
    settings.updateVideoSettings({ 'bunny.apiKey': '' }, account())
    expect(db.select().from(schema.auditLog).all()).toHaveLength(before)
  })
})

describe('changing Google’s keys', () => {
  it('ends the YouTube connection, because its lasting access only works with the old keys', () => {
    const admin = account()
    yt.saveConnection({ id: 'UC1', title: 'Church' }, 'refresh', admin)
    const result = settings.updateVideoSettings({ 'youtube.clientSecret': 'new-secret' }, admin)
    expect(result).toMatchObject({ disconnected: true })
    expect(yt.loadConnection()).toBeUndefined()
    expect(auditActions()).toContain('youtube.disconnect')
  })

  it('leaves the connection alone when only the video host changes, or Google’s keys do not change', () => {
    const admin = account()
    yt.saveConnection({ id: 'UC1', title: 'Church' }, 'refresh', admin)
    expect(settings.updateVideoSettings({ 'bunny.apiKey': 'api' }, admin).disconnected).toBe(false)
    expect(settings.updateVideoSettings({ 'youtube.clientId': '' }, admin).disconnected).toBe(false)
    expect(yt.loadConnection()).toBeDefined()
  })

  it('does not count saving the same value again as a change, so it does not disconnect', () => {
    const admin = account()
    settings.updateVideoSettings({ 'youtube.clientId': 'cid', 'youtube.clientSecret': 'same-secret' }, admin)
    yt.saveConnection({ id: 'UC1', title: 'Church' }, 'refresh', admin)
    const result = settings.updateVideoSettings({ 'youtube.clientId': 'cid', 'youtube.clientSecret': 'same-secret' }, admin)
    expect(result).toEqual({ changed: [], disconnected: false })
    expect(yt.loadConnection()).toBeDefined()
    expect(settings.updateVideoSettings({ 'youtube.clientSecret': 'a-new-secret' }, admin).disconnected).toBe(true)
  })

  it('does not report a disconnect when there was no connection', () => {
    expect(settings.updateVideoSettings({ 'youtube.clientId': 'cid' }, account()).disconnected).toBe(false)
  })
})

void orm

describe('the folder for local video copies', () => {
  const statusOf = (fn: () => unknown) => {
    try { fn() }
    catch (error) { return (error as { statusCode?: number }).statusCode }
    return undefined
  }

  it('is saved only once the server has proved it can write there, creating it if need be', async () => {
    const { existsSync } = await import('node:fs')
    const folder = join(dir, 'videos', 'teaching')
    expect(existsSync(folder)).toBe(false)
    const result = settings.updateVideoSettings({ 'local.path': folder }, account())
    expect(result.changed).toEqual(['local.path'])
    expect(existsSync(folder)).toBe(true)
    const local = await import('../../server/lib/local-video')
    expect(local.localVideoFolder()).toBe(folder)
    expect(local.localVideoStatus()).toMatchObject({ path: folder, writable: true })
    expect(typeof local.localVideoStatus().freeBytes).toBe('number')
  })

  it('leaves no test file behind in the folder', async () => {
    const { readdirSync } = await import('node:fs')
    const folder = join(dir, 'clean-check')
    settings.updateVideoSettings({ 'local.path': folder }, account())
    expect(readdirSync(folder)).toEqual([])
  })

  it('refuses a folder that is not a full path, or climbs out with “..”, with a plain reason', () => {
    expect(statusOf(() => settings.updateVideoSettings({ 'local.path': 'videos/teaching' }, account()))).toBe(400)
    expect(statusOf(() => settings.updateVideoSettings({ 'local.path': `${dir}/../elsewhere` }, account()))).toBe(400)
    expect(statusOf(() => settings.updateVideoSettings({ 'local.path': `${dir}/a\0b` }, account()))).toBe(400)
    expect(secrets.readIntegration('local.path').source).toBeNull()
  })

  it('refuses a folder the server cannot write to, and saves nothing', async () => {
    const { writeFileSync } = await import('node:fs')
    const file = join(dir, 'a-file-not-a-folder')
    writeFileSync(file, 'x')
    expect(statusOf(() => settings.updateVideoSettings({ 'local.path': join(file, 'inside') }, account()))).toBe(400)
    expect(secrets.readIntegration('local.path').source).toBeNull()
  })

  it('tidies a trailing slash, and can be turned off again', async () => {
    const local = await import('../../server/lib/local-video')
    const folder = join(dir, 'tidy')
    settings.updateVideoSettings({ 'local.path': `${folder}/` }, account())
    expect(local.localVideoFolder()).toBe(folder)
    settings.updateVideoSettings({ 'local.path': null }, account())
    expect(local.localVideoFolder()).toBeNull()
    expect(local.localVideoStatus()).toEqual({ path: null, writable: false, freeBytes: null })
  })

  it('shows the folder on the settings screen, since it is not a secret', () => {
    settings.updateVideoSettings({ 'local.path': join(dir, 'shown') }, account())
    expect(secrets.integrationView()['local.path']).toEqual({ source: 'ui', value: join(dir, 'shown') })
  })
})
