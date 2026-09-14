// One ministry. Name and description are public; the roster is members-only
// and follows the same privacy rules as the directory.
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

  const base = { id: ministry.id, slug: ministry.slug, name: ministry.name, description: ministry.description }
  const viewer = await getViewer(event)
  if (!viewer.isMember) return base

  const members = loadPeople()
    .filter(person => person.kind === 'member' && person.ministries.some(m => m.id === ministry.id))
    .map(person => presentPerson(person, viewer))
    .filter(entry => entry !== null)
    .map(({ id, firstName, lastName, title, photoUrl }) => ({ id, firstName, lastName, title, photoUrl }))

  return { ...base, members }
})
