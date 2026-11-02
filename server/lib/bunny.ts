// Our video host: Bunny Stream. A message can keep a copy of its video here, next to a
// YouTube link. The host holds the file; this site decides who may watch it, by giving a
// short-lived signed link only to someone who may (server/routes/api/sermons/[slug]/playback.get.ts).
//
// Nothing here is used until the library's number and its two keys are entered on Church details
// (or set in the server's environment as BUNNY_LIBRARY_ID, BUNNY_API_KEY and BUNNY_TOKEN_KEY).
import { createHash, createHmac } from 'node:crypto'
import { createError } from 'h3'
import type { HostedVideoState } from '../../shared/hosted-video.ts'
import { integrationValue } from './integration-secrets.ts'

const API = 'https://video.bunnycdn.com'
// The host's address. Only a test changes it, to talk to a stand-in.
export const bunnyApi = () => process.env.BUNNY_API_BASE || API
const EMBED = 'https://iframe.mediadelivery.net/embed'

export interface BunnyConfig {
  libraryId: string
  // The library's API key: creates and deletes videos and signs uploads. Server only.
  apiKey: string
  // The library's token authentication key, a different value from the API key.
  tokenKey: string
}

export const bunnyConfig = (): BunnyConfig | null => {
  const libraryId = integrationValue('bunny.libraryId')
  const apiKey = integrationValue('bunny.apiKey')
  const tokenKey = integrationValue('bunny.tokenKey')
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
  endpoint: `${bunnyApi()}/tusupload`,
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
  const response = await doFetch(`${bunnyApi()}/library/${config.libraryId}${path}`, {
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
  const response = await doFetch(`${bunnyApi()}/library/${config.libraryId}/videos/${encodeURIComponent(videoId)}`, { method: 'DELETE', headers: { AccessKey: config.apiKey } })
  if (!response.ok && response.status !== 404) throw new BunnyError(`The video host would not remove it (${response.status}).`)
}

// ---- Bringing the original file back --------------------------------------------------

// "vz-abc123-xyz.b-cdn.net" from whatever was typed or pasted (with or without https:// and a path).
export const normalizeCdnHost = (input: string) => {
  const host = input.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase()
  // A port is allowed, though a real delivery hostname has none, so a stand-in can be tried locally.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?$/.test(host) && !/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host)) {
    throw createError({ statusCode: 400, statusMessage: 'Enter the library’s delivery hostname, like vz-abc123-xyz.b-cdn.net, with no https:// or slashes.' })
  }
  return host
}

// The address of the original uploaded file, signed the way a delivery address with token
// authentication on needs it: HMAC-SHA256 of the path and the expiry (no IP, no extra settings),
// URL-safe base64. With token authentication off the host ignores the extra parts.
export const originalFileUrl = (config: BunnyConfig, cdnHost: string, videoId: string, expires: number) => {
  const path = `/${videoId}/original`
  const hash = createHmac('sha256', config.tokenKey).update(`${path}${expires}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  // Only a test, talking to a stand-in over plain http, ever changes the scheme.
  return `${process.env.BUNNY_API_BASE ? 'http' : 'https'}://${cdnHost}${path}?token=HS256-${hash}&expires=${expires}`
}

// What the host says about a video: whether it still holds the original, and that original's checksum.
export const getHostedVideoInfo = async (config: BunnyConfig, videoId: string, doFetch: Fetch = fetch) => {
  const response = await call(config, `/videos/${encodeURIComponent(videoId)}`, { method: 'GET' }, doFetch)
  const video = await response.json() as { hasOriginal?: boolean | null, originalHash?: string | null, status?: number }
  return { hasOriginal: video.hasOriginal === true, originalHash: video.originalHash ? video.originalHash.toLowerCase() : null, status: video.status ?? 0 }
}
