// Better Auth deletes the password of an account whose email is unverified the
// first time that account signs in with a magic link. These tests pin the two
// things that keep that from happening here.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-magic-'))
process.env.DATABASE_PATH = join(dir, 'test.db')
process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth'
// Nothing listens here, so no email leaves the test.
process.env.SMTP_HOST = '127.0.0.1'
process.env.SMTP_PORT = '9'

let authLib: typeof import('../../server/lib/auth')
let db: typeof import('../../server/lib/db').db
let schema: typeof import('../../server/database/schema/index')
let eq: typeof import('drizzle-orm').eq
let like: typeof import('drizzle-orm').like

beforeAll(async () => {
  ;({ db } = await import('../../server/lib/db'))
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  schema = await import('../../server/database/schema/index')
  authLib = await import('../../server/lib/auth')
  ;({ eq, like } = await import('drizzle-orm'))
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

const passwordAccounts = (userId: string) =>
  db.select().from(schema.account).where(eq(schema.account.userId, userId)).all().filter(a => a.providerId === 'credential').length

const signInWithMagicLink = async (email: string) => {
  const ctx = await authLib.auth.$context
  const token = `test-${Math.random()}`
  await ctx.internalAdapter.createVerificationValue({ identifier: token, value: JSON.stringify({ email }), expiresAt: new Date(Date.now() + 60_000) })
  const response = await authLib.auth.api.magicLinkVerify({ query: { token, callbackURL: '/members' }, headers: new Headers(), asResponse: true })
  expect(response.status).toBe(302)
}

describe('magic-link sign-in keeps passwords', () => {
  it('keeps the password of an account an administrator created', async () => {
    const { user } = await authLib.auth.api.createUser({
      body: { email: 'created@example.org', name: 'Created', password: 'a-long-test-password', role: 'member', data: authLib.ADMIN_CREATED },
    })
    await signInWithMagicLink('created@example.org')
    expect(passwordAccounts(user.id)).toBe(1)
  })

  it('keeps a password the person set through the reset email', async () => {
    // Created unverified, as accounts were before ADMIN_CREATED.
    const { user } = await authLib.auth.api.createUser({
      body: { email: 'reset@example.org', name: 'Reset', password: 'a-long-test-password', role: 'member' },
    })
    await authLib.auth.api.requestPasswordReset({ body: { email: 'reset@example.org', redirectTo: '/auth/reset-password' } })
    const row = db.select().from(schema.verification).where(like(schema.verification.identifier, 'reset-password:%')).get()!
    await authLib.auth.api.resetPassword({ body: { newPassword: 'the-new-long-password', token: row.identifier.replace('reset-password:', '') } })

    await signInWithMagicLink('reset@example.org')
    expect(passwordAccounts(user.id)).toBe(1)
  })
})
