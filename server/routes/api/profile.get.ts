// The signed-in person's own directory record. People always see all of their
// own information; the page shows how the privacy rules present it to others.
import { findPersonByUserId, loadPerson } from '../../lib/people.ts'

export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const link = findPersonByUserId(session.user.id)
  if (!link) return { person: null }

  const { account: _account, userId: _userId, ...person } = loadPerson(link.id)!
  return { person }
})
