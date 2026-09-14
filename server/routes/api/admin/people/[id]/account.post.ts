// Give a person sign-in access. Links an existing account with that email, or
// creates a new member account and emails them a link to set a password.
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { accountLinkSchema } from '../../../../../../shared/people.ts'
import { people, user } from '../../../../../database/schema/index.ts'
import { ADMIN_CREATED, auth, linkOrigin } from '../../../../../lib/auth.ts'
import { db } from '../../../../../lib/db.ts'
import { loadPerson, presentForAdmin, recordAudit } from '../../../../../lib/people.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { people: ['update'] })
  const id = getRouterParam(event, 'id')!
  const person = loadPerson(id)
  if (!person) throw createError({ statusCode: 404, statusMessage: 'Person not found' })
  if (person.userId) throw createError({ statusCode: 409, statusMessage: 'This person already has sign-in access' })

  const email = (await readValidatedBody(event, accountLinkSchema.parse)).email.toLowerCase()
  const existing = db.select({ id: user.id }).from(user).where(eq(user.email, email)).get()

  if (existing) {
    const linked = db.select({ id: people.id }).from(people).where(eq(people.userId, existing.id)).get()
    if (linked) throw createError({ statusCode: 409, statusMessage: 'That account is already linked to another directory entry' })

    db.transaction((tx) => {
      tx.update(people).set({ userId: existing.id }).where(eq(people.id, id)).run()
      recordAudit(tx, { actorUserId: session.user.id, action: 'account.link', entityType: 'person', entityId: id })
    })
    return { person: presentForAdmin(loadPerson(id)!), created: false }
  }

  // Creating an account is a user-management power, not just record keeping.
  if (!(await hasPermission(session.user.id, { user: ['create'] }))) {
    throw createError({ statusCode: 403, statusMessage: 'No account uses that email, and you are not allowed to create accounts' })
  }

  const { user: created } = await auth.api.createUser({
    body: {
      email,
      name: `${person.firstName} ${person.lastName}`,
      // Nobody knows this password. They set their own from the email below,
      // or sign in with an emailed link.
      password: randomBytes(32).toString('base64url'),
      role: 'member',
      // See ADMIN_CREATED in server/lib/auth.ts.
      data: ADMIN_CREATED,
    },
  })

  db.transaction((tx) => {
    tx.update(people).set({ userId: created.id }).where(eq(people.id, id)).run()
    recordAudit(tx, { actorUserId: session.user.id, action: 'account.create', entityType: 'person', entityId: id })
  })

  // The admin's request headers, so the emailed link opens the site they are using.
  await auth.api.requestPasswordReset({ body: { email, redirectTo: `${linkOrigin(event.headers)}/auth/reset-password` }, headers: event.headers })

  setResponseStatus(event, 201)
  return { person: presentForAdmin(loadPerson(id)!), created: true }
})
