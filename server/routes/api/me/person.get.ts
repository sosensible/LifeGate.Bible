// Which person in the directory the signed-in account is, if any. `/me` uses it
// to find your own page. No guessing by name or email: an account is connected to
// a person by the church office, or not at all.
import { findPersonByUserId } from '../../../lib/people.ts'

export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  return { personId: findPersonByUserId(session.user.id)?.id ?? null }
})
