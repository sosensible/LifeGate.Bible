import { statementSettingsSchema } from '../../../../../shared/giving.ts'
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { loadStatementSettings, saveStatementSettings } from '../../../../lib/statements.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { giving: ['manage'] })
  const input = await readValidatedBody(event, statementSettingsSchema.parse)
  db.transaction((tx) => {
    const fields = saveStatementSettings(tx, input)
    if (fields.length) recordAudit(tx, { actorUserId: session.user.id, action: 'statementSettings.update', entityType: 'statement', entityId: null, fields })
  })
  return { settings: loadStatementSettings() }
})
