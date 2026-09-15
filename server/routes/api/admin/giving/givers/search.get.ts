import { giverSearchSchema } from '../../../../../../shared/giving.ts'
import { searchGivers } from '../../../../../lib/giving.ts'

// Names only: this is all a Counter learns about givers.
export default defineEventHandler(async (event) => {
  await getGivingViewer(event)
  const { q } = await getValidatedQuery(event, giverSearchSchema.parse)
  return { givers: searchGivers(q) }
})
