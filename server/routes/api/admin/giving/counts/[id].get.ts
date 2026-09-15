import { loadCount } from '../../../../../lib/giving.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireCountAccess(event, { write: false })
  return {
    count: loadCount(viewer.count.id),
    canRecord: viewer.canRecord,
    canView: viewer.canView,
    canManage: viewer.canManage,
  }
})
