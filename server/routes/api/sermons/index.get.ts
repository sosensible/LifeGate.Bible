// The teaching archive: public sermons for everyone, the full archive for members.
import { listSermonsFor } from '../../../lib/sermons.ts'

export default defineEventHandler(async (event) => {
  const viewer = await getSermonViewer(event)
  return listSermonsFor(viewer)
})
