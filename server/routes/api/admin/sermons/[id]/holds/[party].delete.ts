// Lift a pause. Only the party that placed it can: the pastor lifts the pastor's, an
// administrator an administrator's. Nobody can lift another party's, or the teacher's.
import { z } from 'zod'
import { HOLD_PARTIES } from '../../../../../../../shared/sermon-sharing.ts'
import { recordAudit } from '../../../../../../lib/audit.ts'
import { db } from '../../../../../../lib/db.ts'
import { liftHold, loadSermon, presentAdminSermon } from '../../../../../../lib/sermons.ts'

export default defineEventHandler(async (event) => {
  const party = z.enum(HOLD_PARTIES).parse(getRouterParam(event, 'party'))
  const session = await requirePermission(event, { sermonHold: [party] })
  const id = getRouterParam(event, 'id') ?? ''

  db.transaction((tx) => {
    if (liftHold(tx, id, party)) {
      recordAudit(tx, { actorUserId: session.user.id, action: 'sermon.hold', entityType: 'sermon', entityId: id, note: `Pause lifted by the ${party === 'admin' ? 'administrator' : party}` })
    }
  })
  return { sermon: presentAdminSermon(loadSermon({ id })!) }
})
