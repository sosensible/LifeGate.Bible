// Our video host: Bunny Stream. A message can keep a copy of its video here, next to a
// YouTube link. The host holds the file; this site decides who may watch it, by giving a
// short-lived signed link only to someone who may (server/routes/api/sermons/[slug]/playback.get.ts).
//
// Nothing here is used until BUNNY_LIBRARY_ID, BUNNY_API_KEY and BUNNY_TOKEN_KEY are set.
import { createHash } from 'node:crypto'
import type { HostedVideoState } from '../../shared/hosted-video.ts'

const API = 'https://video.bunnycdn.com'
const EMBED = 'https://iframe.mediadelivery.net/embed'

export interface BunnyConfig {
  libraryId: string
  // The library's API key: creates and deletes videos and signs uploads. Server only.
  apiKey: string
  // The library's token authentication key, a different value from the API key.
  tokenKey: string
}

export const bunnyConfig = (): BunnyConfig | null => {
  const libraryId = process.env.BUNNY_LIBRARY_ID?.trim()
  const apiKey = process.env.BUNNY_API_KEY?.trim()
  const tokenKey = process.env.BUNNY_TOKEN_KEY?.trim()
  return libraryId && apiKey && tokenKey ? { libraryId, apiKey, tokenKey } : null
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

// A link to play one video, good until `expires` (Unix seconds). The host checks the hash
// of the key, the video and the time, so the link cannot be altered or lengthened.
export const embedUrl = (config: BunnyConfig, videoId: string, expires: number) =>
  `${EMBED}/${config.libraryId}/${videoId}?token=${sha256(config.tokenKey + videoId + expires)}&expires=${expires}`

// How long a play link lasts. A message is about 45 minutes; a link is fetched when the
// viewer presses play, so a paused message stops being playable for new plays at once.
export const PLAY_LINK_SECONDS = 60 * 60

// What a browser needs to upload one file straight to the host, resumably, without ever
// seeing the API key: the signature covers this library, this video and this expiry.
export const uploadTicket = (config: BunnyConfig, videoId: string, expires: number) => ({
  endpoint: `${API}/tusupload`,
  libraryId: config.libraryId,
  videoId,
  expires,
  signature: sha256(config.libraryId + config.apiKey + expires + videoId),
})

// Seconds a signed upload stays valid. The host asks for at least an hour; a 2 GB file
// on a slow connection needs longer.
export const UPLOAD_TICKET_SECONDS = 6 * 60 * 60

// The host's own video status codes, collapsed to what this site shows.
export const stateFromStatus = (status: number): HostedVideoState => {
  if (status === 4) return 'ready'
  if (status === 5 || status === 6) return 'failed'
  return 'processing'
}

type Fetch = typeof fetch
export class BunnyError extends Error {
  statusCode: number
  constructor(message: string, statusCode = 502) {
    super(message)
    this.statusCode = statusCode
  }
}

const call = async (config: BunnyConfig, path: string, init: RequestInit, doFetch: Fetch) => {
  const response = await doFetch(`${API}/library/${config.libraryId}${path}`, {
    ...init,
    headers: { 'accept': 'application/json', 'content-type': 'application/json', ...init.headers, 'AccessKey': config.apiKey },
  })
  if (!response.ok) throw new BunnyError(`The video host refused that (${response.status}).`)
  return response
}

export const createHostedVideo = async (config: BunnyConfig, title: string, doFetch: Fetch = fetch) => {
  const response = await call(config, '/videos', { method: 'POST', body: JSON.stringify({ title }) }, doFetch)
  const { guid } = await response.json() as { guid?: string }
  if (!guid) throw new BunnyError('The video host did not return a video.')
  return guid
}

export const hostedVideoState = async (config: BunnyConfig, videoId: string, doFetch: Fetch = fetch): Promise<HostedVideoState> => {
  const response = await call(config, `/videos/${encodeURIComponent(videoId)}`, { method: 'GET' }, doFetch)
  const { status } = await response.json() as { status?: number }
  return stateFromStatus(typeof status === 'number' ? status : 0)
}

// A video already gone from the host is gone: nothing left to remove.
export const deleteHostedVideo = async (config: BunnyConfig, videoId: string, doFetch: Fetch = fetch) => {
  const response = await doFetch(`${API}/library/${config.libraryId}/videos/${encodeURIComponent(videoId)}`, { method: 'DELETE', headers: { AccessKey: config.apiKey } })
  if (!response.ok && response.status !== 404) throw new BunnyError(`The video host would not remove it (${response.status}).`)
}
