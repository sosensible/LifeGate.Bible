// The contents list: every help topic this person is allowed to read.
import { presentTopic, readableTopics, searchTopics } from '../../../lib/help.ts'

export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const topics = await readableTopics(session.user.id)
  // ?q= searches the same set, so results never mention pages they cannot open.
  const query = (getQuery(event).q as string | undefined)?.trim() ?? ''

  return {
    topics: topics.map(presentTopic),
    results: query ? searchTopics(topics, query) : null,
  }
})
