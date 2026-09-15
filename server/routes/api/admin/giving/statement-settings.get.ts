import { loadStatementSettings } from '../../../../lib/statements.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { giving: ['view'] })
  return { settings: loadStatementSettings() }
})
