// Accepts whatever a person copies from YouTube and returns the video id, or
// null if it is not a YouTube video link.
//
//   https://www.youtube.com/watch?v=ID   https://youtu.be/ID?si=...
//   https://www.youtube.com/live/ID      https://www.youtube.com/shorts/ID
//   https://www.youtube.com/embed/ID     https://www.youtube-nocookie.com/embed/ID
//   ID on its own

const VIDEO_ID = /^[\w-]{11}$/

const YOUTUBE_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
  'youtube-nocookie.com', 'www.youtube-nocookie.com',
])

export const parseYouTubeId = (input: string): string | null => {
  const value = input.trim()
  if (VIDEO_ID.test(value)) return value

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
  }
  catch {
    return null
  }

  const host = url.hostname.toLowerCase()
  const segments = url.pathname.split('/').filter(Boolean)

  const candidate = host === 'youtu.be'
    ? segments[0]
    : YOUTUBE_HOSTS.has(host)
      ? (segments[0] === 'watch' || segments.length === 0)
          ? url.searchParams.get('v')
          : ['embed', 'live', 'shorts', 'v'].includes(segments[0]!) ? segments[1] : undefined
      : undefined

  return candidate && VIDEO_ID.test(candidate) ? candidate : null
}

export const youTubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`
