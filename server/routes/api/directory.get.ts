// The members directory. Every entry passes through presentPerson, so each
// viewer receives only what they are allowed to see; nothing else leaves the server.
import { presentPerson } from '../../../shared/privacy.ts'
import { loadPeople } from '../../lib/people.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { directory: ['view'] })
  const viewer = await getViewer(event)

  const entries = loadPeople()
    .map(person => presentPerson(person, viewer))
    .filter(entry => entry !== null)

  return { entries, viewer: { isStaff: viewer.isStaff } }
})
