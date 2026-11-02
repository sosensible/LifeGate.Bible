// What the watching page of a shared broadcast is told: whether it is open, what the person needs
// to do to get in, and, only once they are in, where the stream is. Opening it takes a seat.
import { loadBroadcastBySlug, watchState } from '../../../../lib/broadcasts.ts'

export default defineEventHandler(async (event) => {
  const broadcast = loadBroadcastBySlug(getRouterParam(event, 'slug') ?? '')
  if (!broadcast) throw createError({ statusCode: 404, statusMessage: 'Broadcast not found' })
  setHeader(event, 'cache-control', 'no-store')
  return watchState(broadcast, await getBroadcastViewer(event, broadcast))
})
