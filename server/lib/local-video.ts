// Where local copies of the teaching videos are kept, if the church chooses to keep any: a
// folder on the server itself, so the videos survive the video host or YouTube going away.
// The folder is chosen on Church details. This only knows which folder it is and whether it
// can be used; a copy is a plain file in it, named for the message.
import { mkdirSync, rmSync, statfsSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, normalize } from 'node:path'
import { createError } from 'h3'
import { existsSync } from 'node:fs'
import { sermonFiles } from '../database/schema/index.ts'
import { db } from './db.ts'
import { integrationValue } from './integration-secrets.ts'

// The folder as it will be used, or an error saying plainly what is wrong with what was typed.
export const normalizeFolder = (input: string) => {
  const typed = input.trim()
  if (!typed) throw createError({ statusCode: 400, statusMessage: 'Enter the folder to keep videos in.' })
  if (typed.includes('\0')) throw createError({ statusCode: 400, statusMessage: 'That is not a folder name.' })
  if (!isAbsolute(typed)) throw createError({ statusCode: 400, statusMessage: 'Give the full path of the folder, starting with / (or a drive letter), as the server sees it.' })
  if (typed.split(/[\\/]+/).includes('..')) throw createError({ statusCode: 400, statusMessage: 'Leave out “..” from the folder path.' })
  const folder = normalize(typed)
  return folder.length > 1 ? folder.replace(/[\\/]+$/, '') : folder
}

export interface FolderStatus {
  writable: boolean
  // Free space on the disk the folder is on, when the server can tell.
  freeBytes: number | null
}

// Makes the folder if it is missing, and proves the server can write to it.
export const checkFolder = (folder: string): FolderStatus => {
  try {
    mkdirSync(folder, { recursive: true })
    const probe = join(folder, `.write-test-${process.pid}-${Date.now()}`)
    writeFileSync(probe, 'ok')
    rmSync(probe)
  }
  catch {
    return { writable: false, freeBytes: null }
  }
  try {
    const stats = statfsSync(folder)
    return { writable: true, freeBytes: Number(stats.bavail) * Number(stats.bsize) }
  }
  catch {
    return { writable: true, freeBytes: null }
  }
}

// Used when saving the choice: the normalised folder, only if the server can really use it.
export const prepareFolder = (input: string) => {
  const folder = normalizeFolder(input)
  if (!checkFolder(folder).writable) {
    throw createError({ statusCode: 400, statusMessage: 'The server cannot write to that folder. Check it exists on the server, that the server may write there, and, if the site runs in a container, that the folder is on a mounted volume.' })
  }
  return folder
}

// Whether every stored video is really in this folder, where its record says. Used before the
// folder is changed: pointing the site at a folder that does not hold the videos would lose them.
export const holdsAllStoredVideos = (folder: string) =>
  db.select({ relativePath: sermonFiles.relativePath }).from(sermonFiles).all()
    .every(file => existsSync(join(folder, file.relativePath)))

// The chosen folder, or null when the church keeps no local copies.
export const localVideoFolder = () => integrationValue('local.path')

export const localVideoStatus = () => {
  const folder = localVideoFolder()
  return folder ? { path: folder, ...checkFolder(folder) } : { path: null, writable: false, freeBytes: null }
}
