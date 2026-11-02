// Makes one new folder inside a folder on the server, from the folder chooser.
import { z } from 'zod'
import { createFolder } from '../../../../lib/folder-browser.ts'

export default defineEventHandler(async (event) => {
  await requirePermission(event, { integrations: ['manage'] })
  const { parent, name } = await readValidatedBody(event, z.object({ parent: z.string().trim().min(1).max(1000), name: z.string().max(200) }).parse)
  return createFolder(parent, name)
})
