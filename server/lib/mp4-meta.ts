// What an MP4 or MOV file says about itself: when it was made, how long it runs and, for a
// phone, where. Read straight from the file's index (the "moov" box) without a media tool, which
// the site's image does not carry. Other kinds of video (MKV, WebM) are not read here and fall
// back to the file name and the file's date. This is only ever a hint for a person to confirm.
import { open } from 'node:fs/promises'

export interface VideoMeta {
  createdAt: string | null
  durationSeconds: number | null
  location: { latitude: number, longitude: number } | null
}

const NOTHING: VideoMeta = { createdAt: null, durationSeconds: null, location: null }
// A file's index is small; refuse anything that claims to be larger than this.
const MAX_INDEX_BYTES = 64 * 1024 * 1024
// MP4 counts seconds from 1904-01-01.
const SECONDS_1904_TO_1970 = 2_082_844_800

// "+42.3601-071.0589+012.000/" is how phones write a position (ISO 6709).
export const parseLocation = (text: string) => {
  const match = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(text.trim())
  if (!match) return null
  const latitude = Number(match[1])
  const longitude = Number(match[2])
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && (latitude !== 0 || longitude !== 0) ? { latitude, longitude } : null
}

// The text that follows a metadata key in the index. QuickTime files from Apple devices keep a
// few values as key/value pairs, with the key's name spelled out in the file.
const valueAfterKey = (moov: Buffer, key: string, pattern: RegExp) => {
  const at = moov.indexOf(key, 0, 'latin1')
  if (at < 0) return null
  return pattern.exec(moov.toString('latin1', at + key.length, Math.min(moov.length, at + key.length + 600)))?.[0] ?? null
}

// "2026-11-01T10:30:12-0500" (local time with its offset) as an instant; JavaScript wants the colon.
export const parseLocalStamp = (text: string) => {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2}):?(\d{2})$/.exec(text.trim())
  const time = match ? Date.parse(`${match[1]}${match[2]}:${match[3]}`) : Number.NaN
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

// The details in a "moov" box's bytes.
export const readIndex = (moov: Buffer): VideoMeta => {
  const meta: VideoMeta = { createdAt: null, durationSeconds: null, location: null }
  // The movie header is a direct child of moov.
  let offset = 8
  while (offset + 8 <= moov.length) {
    const size = moov.readUInt32BE(offset)
    const type = moov.toString('latin1', offset + 4, offset + 8)
    if (size < 8) break
    if (type === 'mvhd') {
      const body = offset + 8
      const version = moov[body]
      const wide = version === 1
      if (body + (wide ? 32 : 20) <= moov.length) {
        const created = wide ? Number(moov.readBigUInt64BE(body + 4)) : moov.readUInt32BE(body + 4)
        const timescale = moov.readUInt32BE(body + (wide ? 20 : 12))
        const duration = wide ? Number(moov.readBigUInt64BE(body + 24)) : moov.readUInt32BE(body + 16)
        const unix = created - SECONDS_1904_TO_1970
        // Zero means "not set"; anything before 1990 is a clock that was never set.
        if (created > 0 && unix > 631_152_000) meta.createdAt = new Date(unix * 1000).toISOString()
        if (timescale > 0 && duration > 0) meta.durationSeconds = duration / timescale
      }
      break
    }
    offset += size
  }
  // An iPhone also records when it was shot in local time, which beats the header's UTC clock.
  const stamp = valueAfterKey(moov, 'com.apple.quicktime.creationdate', /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}:?\d{2}/)
  meta.createdAt = (stamp ? parseLocalStamp(stamp) : null) ?? meta.createdAt
  // Position: Apple's key, else the "©xyz" atom other phones and cameras write in the user data.
  const apple = valueAfterKey(moov, 'com.apple.quicktime.location.ISO6709', /[+-]\d{1,3}(?:\.\d+)?[+-]\d{1,3}(?:\.\d+)?/)
  meta.location = apple ? parseLocation(apple) : null
  const at = moov.indexOf(Buffer.from([0xA9, 0x78, 0x79, 0x7A]))
  if (!meta.location && at >= 4 && at + 8 <= moov.length) {
    const length = moov.readUInt16BE(at + 4)
    if (length > 0 && at + 8 + length <= moov.length) meta.location = parseLocation(moov.toString('latin1', at + 8, at + 8 + length))
  }
  return meta
}

export const readVideoMeta = async (path: string): Promise<VideoMeta> => {
  let handle
  try {
    handle = await open(path, 'r')
    const { size } = await handle.stat()
    const header = Buffer.alloc(16)
    let offset = 0
    // Walk the top-level boxes, jumping over the big media data, until the index.
    while (offset + 8 <= size) {
      const { bytesRead } = await handle.read(header, 0, 16, offset)
      if (bytesRead < 8) break
      let boxSize = header.readUInt32BE(0)
      const type = header.toString('latin1', 4, 8)
      if (boxSize === 1 && bytesRead >= 16) boxSize = Number(header.readBigUInt64BE(8))
      else if (boxSize === 0) boxSize = size - offset
      if (boxSize < 8) break
      if (type === 'moov') {
        if (boxSize > MAX_INDEX_BYTES || offset + boxSize > size) return NOTHING
        const moov = Buffer.alloc(boxSize)
        await handle.read(moov, 0, boxSize, offset)
        return readIndex(moov)
      }
      offset += boxSize
    }
    return NOTHING
  }
  catch {
    return NOTHING
  }
  finally {
    await handle?.close()
  }
}
