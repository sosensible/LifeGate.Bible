// The church's logo: the set of PNGs the browser made from one picture, stored
// beside the database (never in git, never in the public folder) under a version
// number, and served by /site/logo/<width>.png and /site/icon/<size>.png.
//
// The browser does the resizing (the site has no image library, and a canvas does
// it well), so this checks rather than trusts: every file must really be a PNG, of
// the size its name says, and the three page sizes must be the same shape.
import { eq } from 'drizzle-orm'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createError } from 'h3'
import { ICON_SIZES, LOGO_PART_NAMES, LOGO_WIDTHS, iconPartName, logoPartName } from '../../shared/site-logo.ts'
import { siteSettings } from '../database/schema/index.ts'
import { db } from './db.ts'
import { loadSite } from './site.ts'
import { uploadsDir } from './uploads.ts'

// A generous ceiling for one file and for the set; a real logo is a fraction of this.
export const MAX_LOGO_FILE_BYTES = 1024 * 1024
export const MAX_LOGO_SET_BYTES = 4 * 1024 * 1024

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]

// A PNG's width and height from its header, or null if it is not a PNG.
export const pngSize = (data: Uint8Array) => {
  if (data.length < 24 || !PNG_SIGNATURE.every((byte, i) => data[i] === byte)) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  // The first chunk must be IHDR, whose first two numbers are the size.
  if (String.fromCharCode(data[12]!, data[13]!, data[14]!, data[15]!) !== 'IHDR') return null
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

const refuse = (message: string) => createError({ statusCode: 400, statusMessage: message })

const logoDir = (version: number) => join(uploadsDir(), 'site', String(version))

// Checks the whole set and returns the page logo's proportions.
const validate = (files: Record<string, Uint8Array>) => {
  const missing = LOGO_PART_NAMES.filter(name => !files[name]?.length)
  if (missing.length) throw refuse('The logo is incomplete. Choose the picture again.')

  let total = 0
  for (const name of LOGO_PART_NAMES) {
    const data = files[name]!
    total += data.length
    if (data.length > MAX_LOGO_FILE_BYTES) throw refuse('That logo is too large. Try a smaller picture.')
    if (!pngSize(data)) throw refuse('The logo must be made of PNG pictures.')
  }
  if (total > MAX_LOGO_SET_BYTES) throw refuse('That logo is too large. Try a smaller picture.')

  for (const size of ICON_SIZES) {
    const found = pngSize(files[iconPartName(size)]!)!
    if (found.width !== size || found.height !== size) throw refuse('The icons are not the sizes they should be.')
  }

  // The page sizes must be the same picture at three widths.
  const widest = pngSize(files[logoPartName(LOGO_WIDTHS[LOGO_WIDTHS.length - 1]!)]!)!
  for (const width of LOGO_WIDTHS) {
    const found = pngSize(files[logoPartName(width)]!)!
    const expectedHeight = Math.round((width * widest.height) / widest.width)
    if (found.width !== width || Math.abs(found.height - expectedHeight) > 1) throw refuse('The logo sizes do not match each other.')
  }
  if (widest.height < 1 || widest.height > widest.width * 4) throw refuse('That logo is an unusual shape. Try another picture.')
  return widest
}

// Stores a new logo and makes it the current one. The old files go with it.
// Returns the new version.
export const saveLogoSet = (files: Record<string, Uint8Array>) => {
  const widest = validate(files)
  const before = loadSite().logoVersion
  // Seconds since 1970: always newer than the last, so a browser's cache of the old
  // address can never be mistaken for the new logo, even after a removal.
  const version = Math.max(Math.floor(Date.now() / 1000), before + 1)

  mkdirSync(logoDir(version), { recursive: true })
  try {
    for (const name of LOGO_PART_NAMES) writeFileSync(join(logoDir(version), `${name}.png`), files[name]!)
    db.update(siteSettings).set({ logoVersion: version, logoWidth: widest.width, logoHeight: widest.height }).where(eq(siteSettings.id, 'site')).run()
  }
  catch (error) {
    rmSync(logoDir(version), { recursive: true, force: true })
    throw error
  }
  if (before > 0) rmSync(logoDir(before), { recursive: true, force: true })
  return version
}

// Back to the built-in placeholder.
export const clearLogo = () => {
  const before = loadSite().logoVersion
  db.update(siteSettings).set({ logoVersion: 0, logoWidth: 864, logoHeight: 864 }).where(eq(siteSettings.id, 'site')).run()
  if (before > 0) rmSync(logoDir(before), { recursive: true, force: true })
}

// One file of the current logo, or null if there is none (no upload, or the file
// has gone), in which case the caller falls back to the built-in one.
export const readLogoFile = (part: string) => {
  const { logoVersion } = loadSite()
  if (logoVersion <= 0 || !LOGO_PART_NAMES.includes(part)) return null
  try {
    return readFileSync(join(logoDir(logoVersion), `${part}.png`))
  }
  catch {
    return null
  }
}
