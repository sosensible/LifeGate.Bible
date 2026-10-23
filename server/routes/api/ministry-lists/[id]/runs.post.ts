// Start a run of a routine: a fresh checklist, or tasks to give out, generated
// from its steps. Anyone serving in the ministry may. If a run is already open,
// the caller has to say `replaceOpen` to finish it as unfinished and go on.
import { startRunSchema } from '../../../../../shared/ministry-lists.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { startRun } from '../../../../lib/ministry-lists.ts'

export default defineEventHandler(async (event) => {
  const { session, viewer } = await requireListViewer(event)
  const routineId = getRouterParam(event, 'id') ?? ''
  const { style, replaceOpen } = await readValidatedBody(event, startRunSchema.parse)

  const run = db.transaction((tx) => {
    const started = startRun(tx, viewer, routineId, style, replaceOpen)
    recordAudit(tx, { actorUserId: session.user.id, action: 'ministryList.startRun', entityType: 'ministryList', entityId: started.id })
    return started
  })
  setResponseStatus(event, 201)
  return run
})
