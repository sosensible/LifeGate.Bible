// Runs the real Better Auth + SQLite stack against a throwaway database.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-auth-'))
process.env.DATABASE_PATH = join(dir, 'test.db')
process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth'

let userId = ''
let hasPermission: typeof import('../../server/utils/auth').hasPermission

beforeAll(async () => {
  const { db } = await import('../../server/lib/db')
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })

  const { auth } = await import('../../server/lib/auth')
  const { user } = await auth.api.createUser({
    body: { email: 'staff@lifegate.test', name: 'Staff Member', password: 'a-long-test-password', role: ['member', 'pastor'] },
  })
  userId = user.id
  ;({ hasPermission } = await import('../../server/utils/auth'))
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('server permission guard', () => {
  it('grants a permission held by one of several roles', async () => {
    expect(await hasPermission(userId, { memberArea: ['view'] })).toBe(true)
    expect(await hasPermission(userId, { people: ['viewContact'] })).toBe(true)
  })

  it('grants a combined check spread across two roles', async () => {
    // Better Auth alone denies this, because no single role covers both.
    expect(await hasPermission(userId, { memberArea: ['view'], people: ['viewContact'] })).toBe(true)
  })

  it('denies anything none of the roles grant', async () => {
    expect(await hasPermission(userId, { pastoralApplication: ['view'] })).toBe(false)
    expect(await hasPermission(userId, { memberArea: ['view'], sermon: ['publish'] })).toBe(false)
  })
})
