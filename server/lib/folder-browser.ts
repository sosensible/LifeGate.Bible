// Looking through the server's folders, and making a new one, so an Admin can choose where the
// video copies go without typing a path. Folders only: no file names or contents are ever sent.
// Works on any system the site runs on. It opens on a list of the drives and mounted folders it
// can use (drives on Windows, /Volumes on macOS, the mounted disks on Linux and in a container),
// with the main drive last, so a second drive is easy to choose over the system disk. Only used
// behind the Admin-only integrations right (see the routes).
import { accessSync, constants, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statfsSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { createError } from 'h3'
import { localVideoFolder, normalizeFolder } from './local-video.ts'

export interface FolderListing {
  // null is the top: the list of drives and mounted folders, not a folder itself.
  path: string | null
  // Where "up" goes; '' is that top list, null is nowhere (already there).
  parent: string | null
  // A drive listing also says how much room each has and whether the server may write to it.
  folders: { name: string, path: string, freeBytes?: number | null, writable?: boolean }[]
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

// Kinds of mount that are the system's own plumbing, never somewhere to keep videos.
const PLUMBING = new Set(['proc', 'sysfs', 'tmpfs', 'devtmpfs', 'devpts', 'cgroup', 'cgroup2', 'mqueue', 'overlay', 'squashfs', 'autofs', 'binfmt_misc', 'debugfs', 'tracefs', 'securityfs', 'pstore', 'bpf', 'configfs', 'fusectl', 'hugetlbfs', 'rpc_pipefs', 'nsfs', 'ramfs', 'efivarfs', 'fuse.lxcfs'])
const PLUMBING_PATHS = ['/proc', '/sys', '/dev', '/run', '/boot', '/snap', '/var/lib/docker', '/var/lib/kubelet']

// The mount points in Linux's /proc/self/mountinfo text, with what kind each is. In a container
// this is the host folders and drives that were mounted into it.
export const parseMountInfo = (text: string) => text.split('\n').flatMap((line) => {
  const split = line.indexOf(' - ')
  if (split < 0) return []
  const mountPoint = (line.slice(0, split).split(' ')[4] ?? '').replace(/\\([0-7]{3})/g, (_, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)))
  const fsType = line.slice(split + 3).split(' ')[0] ?? ''
  return mountPoint ? [{ mountPoint, fsType }] : []
})

// The mount points worth offering: real disks and shares, not the system's own plumbing, and not "/".
export const usableMountPoints = (text: string) => parseMountInfo(text)
  .filter(mount => mount.mountPoint !== '/' && !PLUMBING.has(mount.fsType) && !PLUMBING_PATHS.some(root => mount.mountPoint === root || mount.mountPoint.startsWith(`${root}/`)))
  .map(mount => mount.mountPoint)

const mountedFolders = (): string[] => {
  if (process.platform === 'darwin') {
    try {
      return readdirSync('/Volumes').map(name => join('/Volumes', name))
    }
    catch {
      return []
    }
  }
  try {
    return usableMountPoints(readFileSync('/proc/self/mountinfo', 'utf8'))
  }
  catch {
    // No mount table (an unusual system): the usual places drives appear.
    return ['/media', '/mnt'].flatMap((root) => {
      try {
        return readdirSync(root).map(name => join(root, name))
      }
      catch {
        return []
      }
    })
  }
}

const sameFolder = (a: string, b: string) => {
  try {
    return realpathSync(a) === realpathSync(b)
  }
  catch {
    return false
  }
}

// Where videos could be kept: every drive or mounted folder the server can see, the system's own
// drive last. Each says how much room it has and whether the server may write to it.
const places = (): FolderListing['folders'] => {
  if (windows()) return drives().map(drive => ({ name: drive, path: drive, ...roomIn(drive) }))
  const found = [...new Set(mountedFolders())]
    .filter(path => path !== '/' && isFolder(path) && !sameFolder(path, '/'))
    .map(path => ({ name: basename(path) || path, path, ...roomIn(path) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }))
  return [...found, { name: 'Main drive of this computer (/)', path: '/', ...roomIn('/') }]
}

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
// list of drives; an empty string asks for that list itself.
export const listFolder = (input?: string | null): FolderListing => {
  const wanted = input === undefined || input === null ? localVideoFolder() : input.trim()
  if (!wanted) return { path: null, parent: null, folders: places(), more: false, writable: false, freeBytes: null }
  const path = normalizeFolder(wanted)
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
    // The top of a drive goes up to the list of drives.
    parent: up !== path ? up : '',
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
