// Check an item off, or take the check back. Recorded in the list's history.
import { checkSchema } from '../../../../../../../shared/ministry-lists.ts'
import { db } from '../../../../../../lib/db.ts'
import { setItemChecked } from '../../../../../../lib/ministry-lists.ts'

export default defineEventHandler(async (event) => {
  const { viewer } = await requireListViewer(event)
  const listId = getRouterParam(event, 'id') ?? ''
  const itemId = getRouterParam(event, 'item') ?? ''
  const { done } = await readValidatedBody(event, checkSchema.parse)
  return { changed: db.transaction(tx => setItemChecked(tx, viewer, listId, itemId, done)) }
})
