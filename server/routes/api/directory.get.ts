// The members directory, and the speakers list. Every entry passes through
// presentPerson, so each viewer receives only what they are allowed to see;
// nothing else leaves the server. A guest speaker's contact details follow the
// same sharing rules as a member's.
import { presentPerson } from '../../../shared/privacy.ts'
import { loadPeople } from '../../lib/people.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { directory: ['view'] })
  const viewer = await getViewer(event)
  const everyone = loadPeople()

  const entries = everyone
    .filter(person => person.kind === 'member')
    .map(person => presentPerson(person, viewer))
    .filter(entry => entry !== null)

  const speakers = everyone
    .filter(person => person.isSpeaker && !person.speakerArchivedAt)
    .flatMap((person) => {
      const entry = presentPerson(person, viewer)
      return entry ? [{ ...entry, guest: person.kind === 'guest' }] : []
    })

  return { entries, speakers, viewer: { isStaff: viewer.isStaff } }
})
