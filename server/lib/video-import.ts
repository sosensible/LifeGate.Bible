// Bringing videos that were copied onto the church server by hand (over SSH, a file share, a USB
// drive) into the site. They go in an "import" folder inside the chosen video folder. Each one is
// read for a date, matched to a teaching by a person, and then filed exactly like an upload:
// checksummed, moved to its permanent place and recorded, ready to send on to the video host.
import { lstatSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createError } from 'h3'
import { guessDate, isVideoName, suggestTeachings, type GuessedDate, type Suggestion, type TeachingChoice } from '../../shared/video-import.ts'
import { churchTimeZone } from './live.ts'
import { loadLocalFile, storeUploaded } from './local-files.ts'
import { readVideoMeta, type VideoMeta } from './mp4-meta.ts'
import { loadSermon, loadSermons } from './sermons.ts'

export const IMPORT_FOLDER = 'import'
export const importDirectory = (folder: string) => join(folder, IMPORT_FOLDER)

export interface ImportFile {
  name: string
  size: number
  modifiedAt: string
  meta: VideoMeta
  date: GuessedDate
  suggestions: Suggestion[]
}

// Files only, never hidden ones or links, so a link cannot point the import at something elsewhere.
const videoFiles = (directory: string) => readdirSync(directory, { withFileTypes: true })
  .filter(entry => entry.isFile() && !entry.name.startsWith('.') && isVideoName(entry.name))
  .map(entry => entry.name)
  .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }))

// The teachings a recording could be assigned to: newest first, with whether each already has a copy.
export const teachingChoices = (): TeachingChoice[] => loadSermons().map(sermon => ({
  id: sermon.id,
  title: sermon.title,
  preachedOn: sermon.preachedOn,
  speaker: sermon.speaker,
  hasCopy: Boolean(sermon.localFile),
}))

// Looks in the import folder (making it, so there is somewhere to copy into) and describes each video.
export const scanImport = async (folder: string, timeZone = churchTimeZone()) => {
  const directory = importDirectory(folder)
  mkdirSync(directory, { recursive: true })
  const teachings = teachingChoices()
  const files: ImportFile[] = []
  for (const name of videoFiles(directory)) {
    const stats = lstatSync(join(directory, name))
    const modifiedAt = stats.mtime.toISOString()
    const meta = /\.(mp4|m4v|mov)$/i.test(name) ? await readVideoMeta(join(directory, name)) : { createdAt: null, durationSeconds: null, location: null }
    const date = guessDate({ fileName: name, videoCreatedAt: meta.createdAt, modifiedAt, timeZone })
    files.push({ name, size: stats.size, modifiedAt, meta, date, suggestions: suggestTeachings(teachings, date, name) })
  }
  return { directory, files, teachings }
}

// Files one video from the import folder as a teaching's copy. A teaching that already has a copy
// is left alone unless the person said to replace it.
export const importFile = async (options: { folder: string, fileName: string, sermonId: string, replace: boolean, userId: string }) => {
  if (basename(options.fileName) !== options.fileName || options.fileName.startsWith('.') || !isVideoName(options.fileName)) {
    throw createError({ statusCode: 400, statusMessage: 'That is not a video file in the import folder.' })
  }
  const path = join(importDirectory(options.folder), options.fileName)
  let isFile = false
  try {
    isFile = lstatSync(path).isFile()
  }
  catch {}
  if (!isFile) throw createError({ statusCode: 404, statusMessage: 'That file is no longer in the import folder.' })
  if (!loadSermon({ id: options.sermonId })) throw createError({ statusCode: 404, statusMessage: 'That teaching was not found.' })
  if (loadLocalFile(options.sermonId) && !options.replace) {
    throw createError({ statusCode: 409, statusMessage: 'That teaching already has a copy on the church server. Choose to replace it, or pick another teaching.' })
  }
  try {
    return await storeUploaded({ folder: options.folder, incomingPath: path, sermonId: options.sermonId, originalName: options.fileName, userId: options.userId })
  }
  catch (error) {
    console.error('[video-import] could not file a video', error)
    throw createError({ statusCode: 500, statusMessage: 'The video could not be filed. Check there is room on the drive and that the server may write to it.' })
  }
}
