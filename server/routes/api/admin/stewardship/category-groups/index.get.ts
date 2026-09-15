// Groups and their categories. Names only, so grant managers can use it too.
import { loadCategoryGroups } from '../../../../../lib/stewardship.ts'

export default defineEventHandler(async (event) => {
  await requireAnyPermission(event, [{ stewardship: ['view'] }, { stewardship: ['grantAccess'] }])
  return { groups: loadCategoryGroups() }
})
