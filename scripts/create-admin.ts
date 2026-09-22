// Create an administrator from the command line.
//
// The first admin has nobody to invite them, so this exists outside the app.
// It also doubles as the bootstrap path on a fresh deployment: the container
// builds its own empty database at startup (server/plugins/migrate.ts), and
// this is what puts the first sign-in account into it.
//
//   npm run admin:create -- someone@example.org "Full Name"     (dev machine)
//   docker exec -it <container> node scripts/create-admin.ts \
//     someone@example.org "Full Name"                            (deployed)
//
// The account gets a random password nobody knows. Sign in with "Email me a
// sign-in link", then set a real password with "Forgot password?" if wanted.
//
// `docker exec` runs inside the already-running container, so it inherits the
// environment the container was started with (DATABASE_PATH, BETTER_AUTH_*)
// with no `--env-file` needed -- there is no .env file in the image, only the
// environment variables the app definition set.
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { user } from '../server/database/schema/index.ts'
import { recordAudit } from '../server/lib/audit.ts'
import { ADMIN_CREATED, auth } from '../server/lib/auth.ts'
import { db } from '../server/lib/db.ts'

const [rawEmail, ...nameParts] = process.argv.slice(2)
const email = rawEmail?.toLowerCase()
const name = nameParts.join(' ').trim()

if (!email || !name) {
  console.error('Usage: npm run admin:create -- <email> "<full name>"')
  process.exit(1)
}

if (db.select({ id: user.id }).from(user).where(eq(user.email, email)).get()) {
  console.error(`An account with ${email} already exists. This creates a new one; it does not change roles on an existing account.`)
  process.exit(1)
}

const { user: created } = await auth.api.createUser({
  body: {
    email,
    name,
    password: randomBytes(32).toString('base64url'),
    role: ['admin', 'member'],
    // See ADMIN_CREATED in server/lib/auth.ts.
    data: ADMIN_CREATED,
  },
})

// Every other path that creates an account records this; a CLI bootstrap
// should not be the one silent exception in the trail.
recordAudit(db, {
  actorUserId: null,
  action: 'account.create',
  entityType: 'user',
  entityId: created.id,
  note: 'Created via admin:create (CLI bootstrap, no signed-in actor)',
})

console.log(`Created ${created.email} with roles: ${(created as { role?: string }).role}`)
console.log('Sign in at /login with "Email me a sign-in link".')
