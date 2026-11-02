// A message's own hosted copy of its video, kept on the church's video host (Bunny Stream)
// next to, or instead of, a YouTube link. See server/lib/bunny.ts.
export const HOSTED_VIDEO_STATES = ['processing', 'ready', 'failed'] as const
export type HostedVideoState = (typeof HOSTED_VIDEO_STATES)[number]

export const HOSTED_VIDEO_LABELS: Record<HostedVideoState, string> = {
  processing: 'Getting ready',
  ready: 'Ready',
  failed: 'Did not process',
}

// What the screens are told about it. The host's id is never part of this: playing needs
// a short-lived link from the server, which only someone who may watch is given.
export interface HostedVideoView {
  state: HostedVideoState
}

// Where the player should look: our own copy once it is ready, otherwise the YouTube
// video, otherwise nothing. A copy that is still processing or failed never hides a
// YouTube video that works.
export type PlayerSource = 'hosted' | 'youtube' | 'none'
export const playerSource = (video: { hosted: HostedVideoView | null, youtubeId: string | null }): PlayerSource => {
  if (video.hosted?.state === 'ready') return 'hosted'
  if (video.youtubeId) return 'youtube'
  return 'none'
}

// A title, and the date if the file name starts with one, from what a volunteer called the
// file: "2026-11-01_The Good Shepherd.mp4" gives "The Good Shepherd" and 2026-11-01.
export const detailsFromFileName = (fileName: string): { title: string, date: string | null } => {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, '')
  const dated = /^(\d{4})[-._](\d{2})[-._](\d{2})(?=$|[\s_.-])/.exec(base)
  const month = Number(dated?.[2])
  const day = Number(dated?.[3])
  const date = dated && month >= 1 && month <= 12 && day >= 1 && day <= 31 ? `${dated[1]}-${dated[2]}-${dated[3]}` : null
  const rest = (date ? base.slice(dated![0].length) : base)
    .replace(/[_]+/g, ' ')
    .replace(/^[\s._-]+|[\s._-]+$/g, '')
    .replace(/\s+/g, ' ')
  return { title: rest, date }
}

// ---- Sending the stored copy on to the church video host ---------------------------

// After this many failed tries it stops until someone presses Send again.
export const MAX_PUSH_ATTEMPTS = 8

export interface HostPushView {
  state: 'queued' | 'sending' | 'sent' | 'failed'
  attempts: number
  // Why the last try failed, while it is failed.
  error: string | null
  // Failed, but the site will try again by itself.
  willRetry: boolean
}

export const presentPush = (push: { state: HostPushView['state'], attempts: number, lastError: string | null } | null | undefined): HostPushView | null =>
  push
    ? { state: push.state, attempts: push.attempts, error: push.state === 'failed' ? push.lastError : null, willRetry: push.state === 'failed' && push.attempts < MAX_PUSH_ATTEMPTS }
    : null
