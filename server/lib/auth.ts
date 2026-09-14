// Better Auth: accounts, sessions, password + magic-link sign-in, roles.
//
// Nobody can self-register. Accounts are created by an admin (or the seed
// command in scripts/create-admin.ts) and people then sign in with a magic
// link or set a password through the reset flow.
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, magicLink } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import { ac, roles } from '../../shared/auth/permissions.ts'
import { user as userTable } from '../database/schema/index.ts'
import { recordAudit } from './audit.ts'
import { db } from './db.ts'
import { renderActionEmail, sendMailInBackground } from './mail.ts'

const baseURL = process.env.BETTER_AUTH_URL || 'http://localhost:3007'

const trustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS || baseURL)
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

// Which site an emailed link should open: the one the request came from
// (e.g. https://new.lifegate.bible through the tunnel, or localhost), but only
// if it is a trusted origin. Anything else falls back to BETTER_AUTH_URL, so a
// forged Origin header cannot put someone else's site in the email.
export const linkOrigin = (headers?: Headers | null) => {
  const origin = headers?.get('origin')
  return origin && trustedOrigins.includes(origin) ? origin : baseURL
}

// Better Auth builds reset links on BETTER_AUTH_URL; move them to linkOrigin.
const onOrigin = (url: string, headers?: Headers | null) =>
  url.startsWith(baseURL) ? linkOrigin(headers) + url.slice(baseURL.length) : url

// Extra fields for every account an administrator creates. Nobody can sign up
// here, so an address an administrator enters is the church's own record, not
// a stranger's claim. Marking it verified stops Better Auth from deleting the
// account's password on its first magic-link sign-in (see onPasswordReset).
export const ADMIN_CREATED = { emailVerified: true }

export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins,

  database: drizzleAdapter(db, { provider: 'sqlite' }),

  // Every successful sign-in (password, magic link) creates a session; record
  // it so the audit log and the accounts page can show sign-in activity.
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          recordAudit(db, { actorUserId: session.userId, action: 'auth.signIn', entityType: 'user', entityId: session.userId })
        },
      },
    },
  },

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    // Better Auth only calls this for an existing account. Not awaited, so the
    // response time does not reveal whether the address has one.
    sendResetPassword: async ({ user, url }, request) => {
      sendMailInBackground({
        to: user.email,
        subject: 'Set your Lifegate password',
        ...renderActionEmail({
          heading: 'Set your password',
          intro: `Hello ${user.name}, use the button below to choose a password for your Lifegate account.`,
          actionLabel: 'Choose a password',
          actionUrl: onOrigin(url, request?.headers),
          footnote: 'This link expires in one hour. If you did not ask for this, you can ignore this email.',
        }),
      })
    },
    // Using the emailed reset link proves the person owns the address. Without
    // this, Better Auth treats the email as unverified and DELETES the password
    // the first time they sign in with a magic link (its guard against someone
    // pre-registering another person's email, which cannot happen here because
    // sign-up is disabled). Verified with a probe against Better Auth 1.7.4.
    onPasswordReset: async ({ user: resetUser }) => {
      if (!resetUser.emailVerified) {
        const ctx = await auth.$context
        await ctx.internalAdapter.updateUser(resetUser.id, { emailVerified: true })
      }
    },
  },

  plugins: [
    admin({
      ac,
      roles,
      // An account is not a church member until someone grants `member`.
      defaultRole: 'user',
    }),

    magicLink({
      disableSignUp: true,
      expiresIn: 60 * 15,
      sendMagicLink: async ({ email, token }, ctx) => {
        // Better Auth calls this for ANY address, so its response cannot reveal
        // whether an account exists. Left alone, that lets anyone make the
        // church email arbitrary addresses. Skip strangers silently: the HTTP
        // response is identical, and sending is not awaited either way, so
        // timing does not give it away.
        const existing = db
          .select({ id: userTable.id })
          .from(userTable)
          .where(eq(userTable.email, email.toLowerCase()))
          .get()
        if (!existing) return

        // Link to our own confirmation page, NOT straight to the verify
        // endpoint. Email security scanners open links automatically; a link
        // that signs in on load would be spent before the person clicks it.
        const confirmUrl = `${linkOrigin(ctx?.headers)}/auth/magic-link?token=${encodeURIComponent(token)}`
        sendMailInBackground({
          to: email,
          subject: 'Your Lifegate sign-in link',
          ...renderActionEmail({
            heading: 'Sign in to Lifegate',
            intro: 'Use the button below to sign in. The link works once.',
            actionLabel: 'Sign in',
            actionUrl: confirmUrl,
            footnote: 'This link expires in 15 minutes. If you did not ask for it, you can ignore this email.',
          }),
        })
      },
    }),
  ],
})
