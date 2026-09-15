import { designationGroups } from '../../../../lib/giving.ts'

// Budget categories a gift can be designated for: names only.
export default defineEventHandler(async (event) => {
  await getGivingViewer(event)
  return { groups: designationGroups() }
})
