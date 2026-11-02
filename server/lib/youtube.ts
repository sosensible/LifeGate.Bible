// The church's YouTube channel, so a message's video can be posted to it from the site.
//
// Someone who may change the church's details connects the channel once: they sign in to
// Google and approve two things only, uploading videos and reading the channel's name. The site
// keeps the refresh token encrypted, and asks Google for a short-lived access token each time it
// needs one. The video file itself goes from the volunteer's browser straight to YouTube; this
// server only starts the upload and then confirms the video landed on the church's channel.
//
// Nothing here is used until Google's client id and secret are entered on Church details (or set
// in the server's environment as YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET).
import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { YouTubeStatus } from '../../shared/youtube-status.ts'
import { youtubeConnection } from '../database/schema/index.ts'
import { db } from './db.ts'
import { integrationValue } from './integration-secrets.ts'
import { decryptToken, encryptToken } from './secret-box.ts'

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
// Google's addresses. Only a test changes them, to talk to a stand-in.
const testBase = () => process.env.YOUTUBE_TEST_BASE?.replace(/\/$/, '')
const TOKEN = () => testBase() ? `${testBase()}/token` : 'https://oauth2.googleapis.com/token'
const REVOKE = () => testBase() ? `${testBase()}/revoke` : 'https://oauth2.googleapis.com/revoke'
const API = () => testBase() ? `${testBase()}/youtube/v3` : 'https://www.googleapis.com/youtube/v3'
const UPLOAD = () => testBase() ? `${testBase()}/upload/youtube/v3/videos` : 'https://www.googleapis.com/upload/youtube/v3/videos'

// Upload videos, and read the channel's name. Nothing that could change or delete anything else.
export const YOUTUBE_SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly']

const ID = 'church'

export interface YouTubeConfig {
  clientId: string
  clientSecret: string
  // Where Google sends the person back after they approve: must be registered with Google.
  redirectUri: string
}

export const siteOrigin = () => (process.env.BETTER_AUTH_URL || process.env.NUXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')

export const youtubeConfig = (): YouTubeConfig | null => {
  const clientId = integrationValue('youtube.clientId')
  const clientSecret = integrationValue('youtube.clientSecret')
  const origin = siteOrigin()
  return clientId && clientSecret && origin ? { clientId, clientSecret, redirectUri: `${origin}/api/admin/youtube/callback` } : null
}

const secret = () => {
  const value = process.env.BETTER_AUTH_SECRET
  if (!value) throw new Error('BETTER_AUTH_SECRET is not set')
  return value
}

const b64 = (buffer: Buffer) => buffer.toString('base64url')

// ---- Keeping the refresh token --------------------------------------------------
// Encrypted like every other key the site keeps (server/lib/secret-box.ts).
export { decryptToken, encryptToken } from './secret-box.ts'

// ---- Sign-in: the state that proves the person returning is the one who left -----

const STATE_SECONDS = 10 * 60
const signature = (payload: string, key: string) => b64(createHmac('sha256', `youtube-state:${key}`).update(payload).digest())

export const signState = (userId: string, now = Date.now(), key = secret()) => {
  const payload = b64(Buffer.from(`${userId}.${Math.floor(now / 1000) + STATE_SECONDS}`))
  return `${payload}.${signature(payload, key)}`
}

// The person the state was made for, or null if it is altered, expired or for no one.
export const verifyState = (state: string, now = Date.now(), key = secret()): string | null => {
  const [payload, sig] = state.split('.')
  if (!payload || !sig) return null
  const expected = Buffer.from(signature(payload, key))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  const text = Buffer.from(payload, 'base64url').toString()
  const at = text.lastIndexOf('.')
  const expires = Number(text.slice(at + 1))
  return at > 0 && Number.isFinite(expires) && expires * 1000 > now ? text.slice(0, at) : null
}

export const authUrl = (config: YouTubeConfig, state: string) => {
  const url = new URL(AUTH)
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: YOUTUBE_SCOPES.join(' '),
    // Offline so Google gives a refresh token; consent so it does so again on a reconnect.
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString()
  return url.toString()
}

// ---- Talking to Google -----------------------------------------------------------

type Fetch = typeof fetch
export class YouTubeError extends Error {
  statusCode: number
  constructor(message: string, statusCode = 502) {
    super(message)
    this.statusCode = statusCode
  }
}

const form = async (url: string, body: Record<string, string>, doFetch: Fetch) => {
  const response = await doFetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() })
  const json = await response.json().catch(() => ({})) as Record<string, string>
  if (!response.ok) throw new YouTubeError(json.error_description || json.error || `Google refused that (${response.status}).`)
  return json
}

export const exchangeCode = async (config: YouTubeConfig, code: string, doFetch: Fetch = fetch) => {
  const json = await form(TOKEN(), { code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: 'authorization_code' }, doFetch)
  if (!json.refresh_token || !json.access_token) throw new YouTubeError('Google did not give the site lasting access. Disconnect the site from your Google account’s connected apps, then try again.')
  return { accessToken: json.access_token, refreshToken: json.refresh_token }
}

export const refreshAccessToken = async (config: YouTubeConfig, refreshToken: string, doFetch: Fetch = fetch) => {
  const json = await form(TOKEN(), { refresh_token: refreshToken, client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'refresh_token' }, doFetch)
  if (!json.access_token) throw new YouTubeError('Google did not give the site access. Connect the channel again.')
  return json.access_token
}

export const revokeToken = async (token: string, doFetch: Fetch = fetch) => {
  await form(REVOKE(), { token }, doFetch).catch(() => {})
}

const get = async <T>(accessToken: string, path: string, doFetch: Fetch): Promise<T> => {
  const response = await doFetch(`${API()}${path}`, { headers: { authorization: `Bearer ${accessToken}` } })
  if (!response.ok) throw new YouTubeError(`YouTube refused that (${response.status}).`)
  return await response.json() as T
}

export const fetchChannel = async (accessToken: string, doFetch: Fetch = fetch) => {
  const { items } = await get<{ items?: Array<{ id: string, snippet?: { title?: string } }> }>(accessToken, '/channels?part=snippet&mine=true', doFetch)
  const channel = items?.[0]
  if (!channel) throw new YouTubeError('That Google account has no YouTube channel. Create or choose the church’s channel first.', 409)
  return { id: channel.id, title: channel.snippet?.title ?? channel.id }
}

// Whether a video id is really on this channel, so a browser cannot attach someone else's video.
export const videoIsOnChannel = async (accessToken: string, videoId: string, channelId: string, doFetch: Fetch = fetch) => {
  const { items } = await get<{ items?: Array<{ snippet?: { channelId?: string } }> }>(accessToken, `/videos?part=snippet&id=${encodeURIComponent(videoId)}`, doFetch)
  return items?.[0]?.snippet?.channelId === channelId
}

// Starts a resumable upload and returns the address the file is sent to.
export const startUploadSession = async (
  accessToken: string,
  video: { title: string, description: string | null, privacy: 'unlisted' | 'private' | 'public' },
  file: { size: number, type: string },
  // Only a browser sending the file itself needs this, so Google lets it from this site's address.
  origin: string | null,
  doFetch: Fetch = fetch,
) => {
  const response = await doFetch(`${UPLOAD()}?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-length': String(file.size),
      'x-upload-content-type': file.type || 'video/*',
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify({
      snippet: { title: video.title.slice(0, 100), description: video.description?.slice(0, 5000) ?? '' },
      status: { privacyStatus: video.privacy, selfDeclaredMadeForKids: false },
    }),
  })
  const location = response.headers.get('location')
  if (!response.ok || !location) throw new YouTubeError(`YouTube would not start the upload (${response.status}).`)
  return location
}

// ---- The saved connection --------------------------------------------------------

export const loadConnection = () => db.select().from(youtubeConnection).where(eq(youtubeConnection.id, ID)).get()

export const saveConnection = (channel: { id: string, title: string }, refreshToken: string, userId: string) => {
  const values = { channelId: channel.id, channelTitle: channel.title, refreshTokenEncrypted: encryptToken(refreshToken), connectedBy: userId, connectedAt: new Date() }
  db.insert(youtubeConnection).values({ id: ID, ...values }).onConflictDoUpdate({ target: youtubeConnection.id, set: values }).run()
}

export const deleteConnection = () => {
  db.delete(youtubeConnection).where(eq(youtubeConnection.id, ID)).run()
}

// A fresh access token for the connected channel, or null when it is not connected.
export const connectedAccess = async (config: YouTubeConfig, doFetch: Fetch = fetch) => {
  const connection = loadConnection()
  if (!connection) return null
  const accessToken = await refreshAccessToken(config, decryptToken(connection.refreshTokenEncrypted), doFetch)
  return { accessToken, channelId: connection.channelId, channelTitle: connection.channelTitle }
}

export const youtubeStatus = (): YouTubeStatus => {
  const connection = loadConnection()
  const origin = siteOrigin()
  return {
    configured: youtubeConfig() !== null,
    connected: Boolean(connection),
    channelTitle: connection?.channelTitle ?? null,
    redirectUri: origin ? `${origin}/api/admin/youtube/callback` : null,
  }
}
