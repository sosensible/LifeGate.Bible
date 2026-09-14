// Public list of ministries. Members also get how many people serve in each,
// counting only the people that viewer could see on the roster.
import { asc } from 'drizzle-orm'
import { presentPerson } from '../../../../shared/privacy.ts'
import { ministries } from '../../../database/schema/index.ts'
import { db } from '../../../lib/db.ts'
import { loadPeople } from '../../../lib/people.ts'

export default defineEventHandler(async (event) => {
  const viewer = await getViewer(event)
  const list = db.select().from(ministries).orderBy(asc(ministries.name)).all()

  if (!viewer.isMember) {
    return list.map(({ id, slug, name, description }) => ({ id, slug, name, description }))
  }

  // Rosters list church members; guests (such as guest speakers) do not serve here.
  const visible = loadPeople().filter(person => person.kind === 'member' && presentPerson(person, viewer))
  return list.map(({ id, slug, name, description }) => ({
    id,
    slug,
    name,
    description,
    memberCount: visible.filter(person => person.ministries.some(m => m.id === id)).length,
  }))
})
