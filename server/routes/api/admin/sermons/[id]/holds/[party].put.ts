// The pastor or an administrator pauses sharing of a message. Each has their own pause:
// the right to place one is the right for that party alone, and a pause blocks the message
// whatever the office or the teacher has set.
import { z } from 'zod'
import { HOLD_PARTIES } from '../../../../../../../shared/sermon-sharing.ts'
import { recordAudit } from '../../../../../../lib/audit.ts'
import { db } from '../../../../../../lib/db.ts'
import { loadSermon, placeHold, presentAdminSermon } from '../../../../../../lib/sermons.ts'

export default defineEventHandler(async (event) => {
  const party = z.enum(HOLD_PARTIES).parse(getRouterParam(event, 'party'))
  const session = await requirePermission(event, { sermonHold: [party] })
  const id = getRouterParam(event, 'id') ?? ''

  db.transaction((tx) => {
    if (placeHold(tx, id, party, session.user.id)) {
      recordAudit(tx, { actorUserId: session.user.id, action: 'sermon.hold', entityType: 'sermon', entityId: id, note: `Paused by the ${party === 'admin' ? 'administrator' : party}` })
    }
  })
  return { sermon: presentAdminSermon(loadSermon({ id })!) }
})
