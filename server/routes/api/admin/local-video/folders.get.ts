// The folders inside one folder on the server, for choosing where video copies are kept.
import { listFolder } from '../../../../lib/folder-browser.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { integrations: ['manage'] })
  setHeader(event, 'cache-control', 'no-store')
  const { path } = getQuery(event)
  return listFolder(typeof path === 'string' ? path : undefined)
})
