// Re-read the Google Calendar feed now, rather than waiting for the daily
// read. For the people who keep the schedule: an event added in Google shows on
// the site as soon as they press the button.
import { loadCalendar } from '../../../../lib/calendar.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import type { CalendarPayload } from '../../../../../shared/calendar.ts'

export default defineEventHandler(async (event): Promise<CalendarPayload> => {
  const session = await requirePermission(event, { liveMeeting: ['manage'] })
  const payload = await loadCalendar(true)

  recordAudit(db, {
    actorUserId: session.user.id,
    action: 'calendar.refresh',
    entityType: 'calendar',
    entityId: null,
    note: `${payload.events.length} upcoming events`,
  })

  return payload
})
