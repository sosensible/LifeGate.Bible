// Directory entries with no sign-in access, to choose whom an account belongs to.
// Connecting accounts to people is directory work (`people:update`).
import { loadUnlinkedPeople } from '../../../../lib/accounts.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { people: ['update'] })
  return { people: loadUnlinkedPeople() }
})
