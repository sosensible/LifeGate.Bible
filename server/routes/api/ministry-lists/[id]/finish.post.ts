// Finish a run. It becomes a read-only record, marked complete if every step was
// done and ended if steps were left.
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { finishRun } from '../../../../lib/ministry-lists.ts'

export default defineEventHandler(async (event) => {
  const { session, viewer } = await requireListViewer(event)
  const runId = getRouterParam(event, 'id') ?? ''
  return db.transaction((tx) => {
    const result = finishRun(tx, viewer, runId)
    recordAudit(tx, { actorUserId: session.user.id, action: 'ministryList.finishRun', entityType: 'ministryList', entityId: runId })
    return result
  })
})
