// Every Better Auth endpoint: sign-in, sign-out, sessions, magic links,
// password reset, admin user management.
import { auth } from '../../../lib/auth.ts'

export default defineEventHandler(event => auth.handler(toWebRequest(event)))
