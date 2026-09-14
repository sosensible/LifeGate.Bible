// Create a sign-in account. It gets a password nobody knows; the person sets
// their own from the emailed link, or signs in with an emailed sign-in link.
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { accountCreateSchema } from '../../../../../shared/accounts.ts'
import { user } from '../../../../database/schema/index.ts'
import { loadAccount, storedRoles } from '../../../../lib/accounts.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { ADMIN_CREATED, auth, linkOrigin } from '../../../../lib/auth.ts'
import { db } from '../../../../lib/db.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { user: ['create', 'set-role'] })
  const input = await readValidatedBody(event, accountCreateSchema.parse)
  const email = input.email.toLowerCase()

  if (db.select({ id: user.id }).from(user).where(eq(user.email, email)).get()) {
    throw createError({ statusCode: 409, statusMessage: 'An account with that email already exists' })
  }

  const { user: created } = await auth.api.createUser({
    body: {
      email,
      name: input.name,
      password: randomBytes(32).toString('base64url'),
      role: storedRoles(input.roles) as never,
      // See ADMIN_CREATED in server/lib/auth.ts.
      data: ADMIN_CREATED,
    },
  })

  recordAudit(db, {
    actorUserId: session.user.id,
    action: 'account.create',
    entityType: 'user',
    entityId: created.id,
    note: `Roles: ${input.roles.join(', ') || 'none'}`,
  })

  if (input.sendPasswordLink) {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: `${linkOrigin(event.headers)}/auth/reset-password` },
      headers: event.headers,
    })
  }

  setResponseStatus(event, 201)
  return { account: loadAccount(created.id) }
})
