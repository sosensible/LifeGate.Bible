// Sending a video file to YouTube, from the browser or from the church server, using the address the site got from
// YouTube for this upload (server/lib/youtube.ts). The whole file goes in one request so the
// browser can report progress; if the connection drops, it asks YouTube how much arrived and
// sends only the rest, so a long upload is not started over.
export interface PutResult {
  status: number
  // YouTube's "bytes=0-12345": how much it has so far.
  range: string | null
  body: string
}

export type Put = (url: string, body: Blob | null, headers: Record<string, string>, onSent?: (sent: number) => void, signal?: AbortSignal) => Promise<PutResult>

const RETRY_DELAYS = [1000, 3000, 10000, 30000, 60000]
const done = (status: number) => status === 200 || status === 201

// How many bytes YouTube says it has, from "bytes=0-12345".
export const receivedFrom = (range: string | null) => {
  const last = range ? /(\d+)\s*$/.exec(range) : null
  return last ? Number(last[1]) + 1 : 0
}

const videoIdFrom = (body: string) => {
  try {
    const { id } = JSON.parse(body) as { id?: string }
    if (id) return id
  }
  catch {
    // Falls through to the error below.
  }
  throw new Error('YouTube accepted the file but did not say which video it is')
}

// Uploads the file and returns the new video's id.
export const uploadToYouTube = async (
  file: Blob,
  uploadUrl: string,
  options: { put: Put, onProgress?: (sent: number, total: number) => void, retryDelays?: number[], sleep?: (ms: number) => Promise<void>, signal?: AbortSignal },
): Promise<string> => {
  const { put, onProgress, signal, retryDelays = RETRY_DELAYS, sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)) } = options
  const total = file.size
  if (!total) throw new Error('That file is empty')

  let offset = 0
  let failures = 0
  for (;;) {
    if (signal?.aborted) throw new Error('Cancelled')
    let result: PutResult | null = null
    try {
      result = await put(uploadUrl, file.slice(offset), { 'Content-Range': `bytes ${offset}-${total - 1}/${total}` }, sent => onProgress?.(offset + sent, total), signal)
    }
    catch {
      result = null
    }
    if (signal?.aborted) throw new Error('Cancelled')
    if (result && done(result.status)) return videoIdFrom(result.body)
    // Anything but a dropped connection, a server hiccup or "send the rest" is final.
    if (result && result.status !== 308 && result.status < 500 && result.status !== 408 && result.status !== 429) {
      throw new Error(result.status === 404 ? 'The upload expired. Start it again.' : `YouTube refused the video (${result.status}).`)
    }

    if (failures >= retryDelays.length) throw new Error('The upload could not be finished. Check the connection and try again.')
    await sleep(retryDelays[failures]!)
    failures += 1

    // Ask where it got to, and carry on from there.
    try {
      const status = await put(uploadUrl, null, { 'Content-Range': `bytes */${total}` }, undefined, signal)
      if (done(status.status)) return videoIdFrom(status.body)
      if (status.status === 308) {
        const received = receivedFrom(status.range)
        if (received > offset) failures = 0
        offset = received
        onProgress?.(offset, total)
      }
    }
    catch {
      // Still no connection: the next round tries again.
    }
  }
}
