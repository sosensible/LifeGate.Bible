// Upload a photo for a missions entry. Returns the stored name, which the
// entry's form then saves. Photos are checked by their contents, not their names.
import { MAX_PHOTO_BYTES, savePhoto } from '../../../../lib/uploads.ts'

export default defineEventHandler(async (event) => {
  await requireMissionsEditor(event)

  const length = Number(getRequestHeader(event, 'content-length') ?? 0)
  if (length > MAX_PHOTO_BYTES + 64 * 1024) {
    throw createError({ statusCode: 413, statusMessage: 'Photos can be up to 5 MB' })
  }

  const file = (await readMultipartFormData(event))?.find(part => part.name === 'photo' && part.data?.length)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'Choose a photo to upload' })

  const photo = savePhoto(file.data)
  setResponseStatus(event, 201)
  return { photo, photoUrl: `/api/missions/photos/${photo}` }
})
