// Who checked what off, and when. Leaders, and staff who may read the list.
import { loadHistory } from '../../../../lib/ministry-lists.ts'

export default defineEventHandler(async (event) => {
  const { viewer } = await requireListViewer(event)
  return { entries: loadHistory(viewer, getRouterParam(event, 'id') ?? '') }
})
