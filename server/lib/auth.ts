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
import { db } from './db.ts'
import { renderActionEmail, sendMailInBackground } from './mail.ts'

const baseURL = process.env.BETTER_AUTH_URL || 'http://localhost:3007'

const trustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS || baseURL)
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins,

  database: drizzleAdapter(db, { provider: 'sqlite' }),

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    // Better Auth only calls this for an existing account. Not awaited, so the
    // response time does not reveal whether the address has one.
    sendResetPassword: async ({ user, url }) => {
      sendMailInBackground({
        to: user.email,
        subject: 'Set your Lifegate password',
        ...renderActionEmail({
          heading: 'Set your password',
          intro: `Hello ${user.name}, use the button below to choose a password for your Lifegate account.`,
          actionLabel: 'Choose a password',
          actionUrl: url,
          footnote: 'This link expires in one hour. If you did not ask for this, you can ignore this email.',
        }),
      })
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
      sendMagicLink: async ({ email, token }) => {
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
        const confirmUrl = `${baseURL}/auth/magic-link?token=${encodeURIComponent(token)}`
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
