// Photos uploaded to the site, stored on the server's disk next to the
// database, never in the public folder: they are served only through routes
// that check who is asking.
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createError } from 'h3'

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

const uploadsDir = () =>
  resolve(process.env.UPLOADS_PATH || join(dirname(process.env.DATABASE_PATH || '.data/lifegate.db'), 'uploads'))

const NAME = /^[0-9a-f-]{36}\.(jpg|png|webp)$/

export const PHOTO_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const

// The file's real type from its first bytes. The name and the browser's claim
// are not trusted, so an HTML or SVG file cannot be passed off as a photo.
export const detectPhotoType = (data: Uint8Array): keyof typeof PHOTO_TYPES | null => {
  if (data.length >= 3 && data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) return 'jpg'
  if (data.length >= 8 && [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A].every((byte, i) => data[i] === byte)) return 'png'
  if (data.length >= 12 && String.fromCharCode(...data.slice(0, 4)) === 'RIFF' && String.fromCharCode(...data.slice(8, 12)) === 'WEBP') return 'webp'
  return null
}

// Saves a photo and returns its stored name, e.g. "3f2c…e1.jpg".
export const savePhoto = (data: Uint8Array) => {
  if (data.length > MAX_PHOTO_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Photos can be up to 5 MB' })
  }
  const type = detectPhotoType(data)
  if (!type) {
    throw createError({ statusCode: 415, statusMessage: 'Upload a JPEG, PNG or WebP photo' })
  }
  const name = `${randomUUID()}.${type}`
  mkdirSync(uploadsDir(), { recursive: true })
  writeFileSync(join(uploadsDir(), name), data)
  return name
}

export const readPhoto = (name: string) => {
  const match = NAME.exec(name)
  if (!match) return null
  try {
    return { data: readFileSync(join(uploadsDir(), name)), type: PHOTO_TYPES[match[1] as keyof typeof PHOTO_TYPES] }
  }
  catch {
    return null
  }
}

export const deletePhoto = (name: string | null | undefined) => {
  if (name && NAME.test(name)) rmSync(join(uploadsDir(), name), { force: true })
}
