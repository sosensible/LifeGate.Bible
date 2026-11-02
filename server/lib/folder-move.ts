// Moving every stored video to another folder, safely.
//
// The old folder stays the one in use until every file has been copied into the new one and
// checked against its recorded checksum. Only then is the choice switched, in one step, and the old
// files removed. If anything goes wrong the old folder is untouched and still the master, and the
// move can be retried (files already copied and checked are not copied again) or cancelled.
//
// While a move runs, new uploads and copies brought in from the video host are refused, so nothing
// is written to the old folder behind the move's back.
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, rmSync } from 'node:fs'
import { dirname, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { eq } from 'drizzle-orm'
import type { FolderMoveView } from '../../shared/folder-move.ts'
import { folderMoves, sermonFiles } from '../database/schema/index.ts'
import { recordAudit } from './audit.ts'
import { db } from './db.ts'
import { saveIntegrations } from './integration-secrets.ts'
import { absolutePath, sha256File } from './local-files.ts'
import { checkFolder, localVideoFolder, normalizeFolder, prepareFolder } from './local-video.ts'
import { createError } from 'h3'

const ID = 'current'

export const loadMove = () => db.select().from(folderMoves).where(eq(folderMoves.id, ID)).get()

export const presentMove = (move: ReturnType<typeof loadMove>): FolderMoveView | null =>
  move
    ? { state: move.state, from: move.fromPath, to: move.toPath, filesTotal: move.filesTotal, filesMoved: move.filesMoved, bytesTotal: move.bytesTotal, bytesMoved: move.bytesMoved, error: move.lastError, startedAt: move.startedAt.toISOString() }
    : null

// True while videos are being moved: nothing may be added to, or taken from, the stored set.
export const moveInProgress = () => loadMove()?.state === 'running'

// Stops an upload or removal from touching the stored set while it is being moved.
export const refuseDuringMove = () => {
  if (moveInProgress()) {
    throw createError({ statusCode: 409, statusMessage: 'The stored videos are being moved to another folder. Try again when that has finished.' })
  }
}

const inside = (outer: string, inner: string) => inner === outer || inner.startsWith(outer + sep)

// Checks the new folder and begins. With nothing stored yet, the folder is simply switched.
export const startFolderMove = (toInput: string, userId: string) => {
  if (moveInProgress()) throw createError({ statusCode: 409, statusMessage: 'A move is already running.' })
  const from = localVideoFolder()
  if (!from) throw createError({ statusCode: 409, statusMessage: 'No folder is set yet. Save a folder instead of moving one.' })
  // The plain checks come first, so a refused move creates nothing, least of all inside the old folder.
  const typed = normalizeFolder(toInput)
  if (typed === from) throw createError({ statusCode: 400, statusMessage: 'That is the folder already in use.' })
  if (inside(from, typed) || inside(typed, from)) throw createError({ statusCode: 400, statusMessage: 'The new folder cannot be inside the old one, or the old one inside it.' })
  const to = prepareFolder(typed)

  const files = db.select().from(sermonFiles).all()
  const bytesTotal = files.reduce((sum, file) => sum + file.size, 0)
  const free = checkFolder(to).freeBytes
  if (free !== null && free < bytesTotal * 1.1) throw createError({ statusCode: 409, statusMessage: 'The new folder does not have room for all the stored videos.' })

  const now = new Date()
  db.transaction((tx) => {
    tx.delete(folderMoves).where(eq(folderMoves.id, ID)).run()
    if (!files.length) {
      saveIntegrations(tx, { 'local.path': to }, userId)
      tx.insert(folderMoves).values({ id: ID, fromPath: from, toPath: to, state: 'done', filesTotal: 0, bytesTotal: 0, startedBy: userId, startedAt: now, updatedAt: now }).run()
    }
    else {
      tx.insert(folderMoves).values({ id: ID, fromPath: from, toPath: to, state: 'running', filesTotal: files.length, bytesTotal, startedBy: userId, startedAt: now, updatedAt: now }).run()
    }
    recordAudit(tx, { actorUserId: userId, action: 'site.folder_move', entityType: 'site', entityId: null, note: files.length ? `Started moving ${files.length} videos to another folder` : 'Changed the folder for stored videos' })
  })
  return presentMove(loadMove())!
}

// Copies one file into the new folder and proves the copy is exact. A file already there with the
// right checksum (from an earlier try) is left as it is.
const copyChecked = async (from: string, to: string, sha256: string) => {
  if (existsSync(to) && await sha256File(to) === sha256) return
  mkdirSync(dirname(to), { recursive: true })
  const partial = `${to}.partial`
  try {
    await pipeline(createReadStream(from), createWriteStream(partial))
    if (await sha256File(partial) !== sha256) throw new Error('A copy did not match its checksum. The stored file may be damaged.')
    renameSync(partial, to)
  }
  catch (error) {
    rmSync(partial, { force: true })
    throw error
  }
}

// Removes now-empty folders left behind, up to but not including the old root.
const pruneEmpty = (root: string, file: string) => {
  let dir = dirname(file)
  while (dir !== root && inside(root, dir)) {
    try {
      if (readdirSync(dir).length) return
      rmdirSync(dir)
    }
    catch {
      return
    }
    dir = dirname(dir)
  }
}

let working = false

// Does the copying. Safe to call again: it carries on from where an earlier try stopped.
export const runFolderMove = async (now: () => number = Date.now) => {
  if (working) return 'busy' as const
  const move = loadMove()
  if (!move || move.state !== 'running') return 'idle' as const
  working = true
  try {
    const files = db.select().from(sermonFiles).all()
    let filesMoved = 0
    let bytesMoved = 0
    for (const file of files) {
      await copyChecked(absolutePath(move.fromPath, file.relativePath), absolutePath(move.toPath, file.relativePath), file.sha256)
      filesMoved += 1
      bytesMoved += file.size
      db.update(folderMoves).set({ filesMoved, bytesMoved, updatedAt: new Date(now()) }).where(eq(folderMoves.id, ID)).run()
    }
    // Every file is in the new folder and checked: switch in one step, then clear the old one. The move
    // is "done" only when that is finished, so the old folder is not touched while a move shows as running.
    db.transaction((tx) => {
      saveIntegrations(tx, { 'local.path': move.toPath }, move.startedBy ?? '')
      recordAudit(tx, { actorUserId: move.startedBy, action: 'site.folder_move', entityType: 'site', entityId: null, note: `Moved ${files.length} videos to another folder` })
    })
    for (const file of files) {
      const old = absolutePath(move.fromPath, file.relativePath)
      rmSync(old, { force: true })
      pruneEmpty(move.fromPath, old)
    }
    db.update(folderMoves).set({ state: 'done', lastError: null, filesMoved, bytesMoved, updatedAt: new Date(now()) }).where(eq(folderMoves.id, ID)).run()
    return 'done' as const
  }
  catch (error) {
    db.update(folderMoves).set({ state: 'failed', lastError: (error instanceof Error ? error.message : String(error)).slice(0, 300), updatedAt: new Date(now()) }).where(eq(folderMoves.id, ID)).run()
    return 'failed' as const
  }
  finally {
    working = false
  }
}

export const kickFolderMove = () => {
  void runFolderMove().catch(error => console.error('[folder-move] could not move', error))
}

// Try again after a failure; files already copied and checked are not copied again.
export const retryFolderMove = () => {
  const move = loadMove()
  if (!move || move.state !== 'failed') throw createError({ statusCode: 409, statusMessage: 'There is no failed move to try again.' })
  db.update(folderMoves).set({ state: 'running', lastError: null, updatedAt: new Date() }).where(eq(folderMoves.id, ID)).run()
}

// Gives up: the copies made in the new folder are removed, the old folder is untouched and stays in use.
export const cancelFolderMove = () => {
  const move = loadMove()
  if (!move || move.state === 'done') throw createError({ statusCode: 409, statusMessage: 'There is no move to cancel.' })
  if (working) throw createError({ statusCode: 409, statusMessage: 'The move is copying right now. Try again in a moment.' })
  for (const file of db.select().from(sermonFiles).all()) {
    const copy = absolutePath(move.toPath, file.relativePath)
    rmSync(copy, { force: true })
    rmSync(`${copy}.partial`, { force: true })
    pruneEmpty(move.toPath, copy)
  }
  db.delete(folderMoves).where(eq(folderMoves.id, ID)).run()
}
