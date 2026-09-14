// One ministry. Name and description are public. The roster lists church
// members who serve in it, leaders first, by each person's own choice: members
// see everyone who has not opted out; the public sees only those who opted in.
import { eq } from 'drizzle-orm'
import { presentPerson } from '../../../../shared/privacy.ts'
import { ministries } from '../../../database/schema/index.ts'
import { db } from '../../../lib/db.ts'
import { loadPeople } from '../../../lib/people.ts'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const ministry = db.select().from(ministries).where(eq(ministries.slug, slug)).get()
  if (!ministry) {
    throw createError({ statusCode: 404, statusMessage: 'Ministry not found' })
  }

  const viewer = await getViewer(event)
  const serving = loadPeople().flatMap((person) => {
    const service = person.ministries.find(m => m.id === ministry.id)
    if (person.kind !== 'member' || !service?.showToMembers) return []
    return [{ person, isLeader: service.isLeader, showPublicly: service.showPublicly }]
  })

  const members = viewer.isMember
    ? serving.flatMap(({ person, isLeader }) => {
        const entry = presentPerson(person, viewer)
        return entry ? [{ id: entry.id, firstName: entry.firstName, lastName: entry.lastName, title: entry.title, photoUrl: entry.photoUrl, isLeader }] : []
      })
    // The public: adults who chose to be shown, by name, title and whether they lead.
    // Nothing else -- no photo, birthday or contact -- ever leaves the members area.
    : serving.filter(({ person, showPublicly }) => showPublicly && !person.isMinor).map(({ person, isLeader }) => ({
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        title: person.title ?? undefined,
        photoUrl: undefined as string | undefined,
        isLeader,
      }))

  // Leaders first; otherwise loadPeople's order (last name, first name).
  members.sort((a, b) => Number(b.isLeader) - Number(a.isLeader))

  return {
    id: ministry.id,
    slug: ministry.slug,
    name: ministry.name,
    description: ministry.description,
    members,
    // Whether the viewer sees the full roster, or only who chose to be shown publicly.
    fullRoster: viewer.isMember,
  }
})
