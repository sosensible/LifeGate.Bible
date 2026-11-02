// Looking through the server's folders, and making a new one, so an Admin can choose where the
// video copies go without typing a path. Folders only: no file names or contents are ever sent.
// Works on any system the site runs on: "/" on Linux, macOS and in a container, and the list of
// drives on Windows. Only used behind the Admin-only integrations right (see the routes).
import { accessSync, constants, existsSync, mkdirSync, readdirSync, statfsSync, statSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'
import { createError } from 'h3'
import { localVideoFolder, normalizeFolder } from './local-video.ts'

export interface FolderListing {
  // null is the top of everything: the list of drives on Windows. Elsewhere "/" is the top.
  path: string | null
  parent: string | null
  folders: { name: string, path: string }[]
  // True when the list was cut short.
  more: boolean
  // Whether the server may put files in this folder, and the room on its disk. Asked of the
  // operating system without writing anything, so just looking leaves no trace. The full test
  // (a real file written and removed) happens when the folder is saved.
  writable: boolean
  freeBytes: number | null
}

export const MAX_FOLDERS = 500
const windows = () => process.platform === 'win32'

const drives = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => `${letter}:\\`).filter(drive => existsSync(drive))

const roomIn = (path: string) => {
  let writable = false
  try {
    accessSync(path, constants.W_OK | constants.X_OK)
    writable = true
  }
  catch {}
  try {
    const stats = statfsSync(path)
    return { writable, freeBytes: Number(stats.bavail) * Number(stats.bsize) }
  }
  catch {
    return { writable, freeBytes: null }
  }
}

const isFolder = (path: string) => {
  try {
    return statSync(path).isDirectory()
  }
  catch {
    return false
  }
}

// What is inside a folder. With nothing given it starts where the videos already are, else at the
// top; an empty string asks for the top itself.
export const listFolder = (input?: string | null): FolderListing => {
  const wanted = input === undefined || input === null ? localVideoFolder() : input.trim()
  if (!wanted && windows()) return { path: null, parent: null, folders: drives().map(drive => ({ name: drive, path: drive })), more: false, writable: false, freeBytes: null }
  const path = wanted ? normalizeFolder(wanted) : parse(process.cwd()).root
  if (!isFolder(path)) throw createError({ statusCode: 404, statusMessage: 'That folder was not found on the server.' })
  let entries
  try {
    entries = readdirSync(path, { withFileTypes: true })
  }
  catch {
    throw createError({ statusCode: 403, statusMessage: 'The server is not allowed to look inside that folder.' })
  }
  const folders = entries
    .filter(entry => !entry.name.startsWith('.') && (entry.isDirectory() || (entry.isSymbolicLink() && isFolder(join(path, entry.name)))))
    .map(entry => ({ name: entry.name, path: join(path, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }))
  const up = dirname(path)
  return {
    path,
    // On Windows the parent of a drive's top is the list of drives; elsewhere "/" has none.
    parent: up !== path ? up : windows() ? '' : null,
    folders: folders.slice(0, MAX_FOLDERS),
    more: folders.length > MAX_FOLDERS,
    ...roomIn(path),
  }
}

// A single folder name: not a path, and nothing a file system would take as one.
const folderName = (input: string) => {
  const name = input.trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Enter a name for the new folder.' })
  // eslint-disable-next-line no-control-regex
  if (name.length > 100 || /[\\/:*?"<>|\u0000-\u001F]/.test(name) || name === '.' || name === '..' || /[. ]$/.test(name)) {
    throw createError({ statusCode: 400, statusMessage: 'Use a plain name, with no slashes or special characters, and not ending in a dot or space.' })
  }
  return name
}

// Makes one new folder inside an existing one. Never makes the folders above it.
export const createFolder = (parent: string, nameInput: string) => {
  const inside = normalizeFolder(parent)
  const name = folderName(nameInput)
  if (!isFolder(inside)) throw createError({ statusCode: 404, statusMessage: 'That folder was not found on the server.' })
  const path = join(inside, name)
  try {
    mkdirSync(path)
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EEXIST') throw createError({ statusCode: 409, statusMessage: 'There is already a folder with that name.' })
    if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') throw createError({ statusCode: 403, statusMessage: 'The server is not allowed to make a folder there.' })
    throw createError({ statusCode: 500, statusMessage: 'The folder could not be made.' })
  }
  return { path, name }
}
