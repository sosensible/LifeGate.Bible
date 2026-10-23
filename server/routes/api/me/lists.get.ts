// The signed-in person's own page: everything assigned to them, then each
// ministry they serve in. It never carries the staff overview.
import { loadMyLists } from '../../../lib/ministry-lists.ts'

export default defineEventHandler(async (event) => {
  const { viewer } = await requireListViewer(event)
  return loadMyLists(viewer)
})
