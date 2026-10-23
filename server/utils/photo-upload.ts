// Reads the one photo out of an upload request, for the routes that set a photo.
// Auto-imported into every server route. The file is checked by its contents, not
// its name, when it is saved (server/lib/uploads.ts).
import type { H3Event } from 'h3'
import { MAX_PHOTO_BYTES } from '../lib/uploads.ts'

export const readUploadedPhoto = async (event: H3Event) => {
  // Refuse a body that is plainly too big before reading it into memory.
  const length = Number(getRequestHeader(event, 'content-length') ?? 0)
  if (length > MAX_PHOTO_BYTES + 64 * 1024) {
    throw createError({ statusCode: 413, statusMessage: 'Photos can be up to 5 MB' })
  }
  const file = (await readMultipartFormData(event))?.find(part => part.name === 'photo' && part.data?.length)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'Choose a photo to upload' })
  return file.data
}
