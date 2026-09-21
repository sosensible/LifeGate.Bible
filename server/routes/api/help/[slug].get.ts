// One help page, rendered. 404 rather than 403 for a topic this person is not
// allowed to read: the help itself says who may do what.
import { presentPage, presentTopic, readableTopics } from '../../../lib/help.ts'

export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const slug = getRouterParam(event, 'slug') ?? ''
  const topics = await readableTopics(session.user.id)
  const topic = topics.find(t => t.slug === slug)
  if (!topic) throw createError({ statusCode: 404, statusMessage: 'Help page not found' })

  return { page: presentPage(topic), topics: topics.map(presentTopic) }
})
