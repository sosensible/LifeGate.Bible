// Create the first administrator. There is no admin yet to send an invite, so
// this runs from the command line against the local database.
//
//   npm run admin:create -- someone@example.org "Full Name"
//
// The account gets a random password nobody knows. Sign in with "Email me a
// sign-in link", then set a real password with "Forgot password?" if wanted.
import { randomBytes } from 'node:crypto'
import { ADMIN_CREATED, auth } from '../server/lib/auth.ts'

const [email, ...nameParts] = process.argv.slice(2)
const name = nameParts.join(' ').trim()

if (!email || !name) {
  console.error('Usage: npm run admin:create -- <email> "<full name>"')
  process.exit(1)
}

const { user } = await auth.api.createUser({
  body: {
    email,
    name,
    password: randomBytes(32).toString('base64url'),
    role: ['admin', 'member'],
    // See ADMIN_CREATED in server/lib/auth.ts.
    data: ADMIN_CREATED,
  },
})

console.log(`Created ${user.email} with roles: ${(user as { role?: string }).role}`)
console.log('Sign in at /login with "Email me a sign-in link".')
