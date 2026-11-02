// Sending a video to YouTube from the browser, and picking up where it left off.
import { describe, expect, it, vi } from 'vitest'
import { receivedFrom, uploadToYouTube, type Put, type PutResult } from '../../shared/youtube-upload'

const file = (size: number) => new Blob([new Uint8Array(size)])
const ok = (id = 'vid-1'): PutResult => ({ status: 200, range: null, body: JSON.stringify({ id }) })
const partial = (last: number): PutResult => ({ status: 308, range: `bytes=0-${last}`, body: '' })
const noSleep = () => Promise.resolve()

// A scripted YouTube: each call to put gets the next answer; an Error rejects.
const script = (answers: Array<PutResult | Error>) => {
  const calls: Array<{ range: string, size: number | null }> = []
  const put = vi.fn(async (_url: string, body: Blob | null, headers: Record<string, string>) => {
    calls.push({ range: headers['Content-Range']!, size: body ? body.size : null })
    const answer = answers.shift()
    if (!answer) throw new Error('no more answers')
    if (answer instanceof Error) throw answer
    return answer
  }) as unknown as Put
  return { put, calls }
}

describe('reading how much YouTube has', () => {
  it('turns the Range header into a byte count, and nothing into zero', () => {
    expect(receivedFrom('bytes=0-1023')).toBe(1024)
    expect(receivedFrom('bytes=0-0')).toBe(1)
    expect(receivedFrom(null)).toBe(0)
    expect(receivedFrom('')).toBe(0)
  })
})

describe('uploading to YouTube', () => {
  it('sends the whole file at once and returns the video id', async () => {
    const { put, calls } = script([ok('abc123')])
    expect(await uploadToYouTube(file(1000), 'https://upload.example/session', { put, sleep: noSleep })).toBe('abc123')
    expect(calls).toEqual([{ range: 'bytes 0-999/1000', size: 1000 }])
  })

  it('picks up where it left off when the connection drops, sending only the rest', async () => {
    const { put, calls } = script([new Error('dropped'), partial(399), ok('after-resume')])
    const id = await uploadToYouTube(file(1000), 'https://upload.example/session', { put, sleep: noSleep })
    expect(id).toBe('after-resume')
    expect(calls).toEqual([
      { range: 'bytes 0-999/1000', size: 1000 },
      { range: 'bytes */1000', size: null },
      { range: 'bytes 400-999/1000', size: 600 },
    ])
  })

  it('starts over from the beginning when YouTube has nothing yet', async () => {
    const { put, calls } = script([new Error('dropped'), { status: 308, range: null, body: '' }, ok()])
    await uploadToYouTube(file(500), 'https://upload.example/session', { put, sleep: noSleep })
    expect(calls[2]).toEqual({ range: 'bytes 0-499/500', size: 500 })
  })

  it('finishes when YouTube says, on the check, that it already has it all', async () => {
    const { put } = script([new Error('dropped'), ok('had-it')])
    expect(await uploadToYouTube(file(500), 'https://upload.example/session', { put, sleep: noSleep })).toBe('had-it')
  })

  it('retries a server error, and waits between tries', async () => {
    const waits: number[] = []
    const { put } = script([{ status: 503, range: null, body: '' }, partial(99), ok()])
    await uploadToYouTube(file(200), 'https://upload.example/session', { put, sleep: async (ms) => { waits.push(ms) }, retryDelays: [5, 10, 20] })
    expect(waits).toEqual([5])
  })

  it('gives up with a plain message after too many failures', async () => {
    const { put } = script(Array.from({ length: 12 }, () => new Error('dropped')))
    await expect(uploadToYouTube(file(100), 'https://upload.example/session', { put, sleep: noSleep, retryDelays: [1, 1, 1] })).rejects.toThrow(/could not be finished/)
  })

  it('does not keep trying when YouTube refuses the video', async () => {
    const { put, calls } = script([{ status: 400, range: null, body: '' }])
    await expect(uploadToYouTube(file(100), 'https://upload.example/session', { put, sleep: noSleep })).rejects.toThrow(/refused the video \(400\)/)
    expect(calls).toHaveLength(1)
  })

  it('says so when the upload session has expired', async () => {
    const { put } = script([{ status: 404, range: null, body: '' }])
    await expect(uploadToYouTube(file(100), 'https://upload.example/session', { put, sleep: noSleep })).rejects.toThrow(/expired/)
  })

  it('refuses an empty file, and a reply with no video id', async () => {
    await expect(uploadToYouTube(file(0), 'https://upload.example/session', { put: script([]).put, sleep: noSleep })).rejects.toThrow(/empty/)
    await expect(uploadToYouTube(file(10), 'https://upload.example/session', { put: script([{ status: 200, range: null, body: '{}' }]).put, sleep: noSleep })).rejects.toThrow(/did not say which video/)
  })

  it('reports progress as bytes are sent, counting from where a resume began', async () => {
    const seen: Array<[number, number]> = []
    const put = vi.fn(async (_u: string, body: Blob | null, headers: Record<string, string>, onSent?: (n: number) => void) => {
      if (!body) return partial(399)
      if (headers['Content-Range']!.startsWith('bytes 0-')) { onSent?.(100); throw new Error('dropped') }
      onSent?.(300)
      return ok()
    }) as unknown as Put
    await uploadToYouTube(file(1000), 'https://upload.example/session', { put, sleep: noSleep, onProgress: (sent, total) => seen.push([sent, total]) })
    expect(seen).toEqual([[100, 1000], [400, 1000], [700, 1000]])
  })

  it('stops at once when cancelled, without retrying', async () => {
    const controller = new AbortController()
    const put = vi.fn(async () => { controller.abort(); throw new Error('aborted') }) as unknown as Put
    await expect(uploadToYouTube(file(100), 'https://upload.example/session', { put, sleep: noSleep, signal: controller.signal })).rejects.toThrow(/Cancelled/)
    expect(put).toHaveBeenCalledTimes(1)
  })

  it('does not give up on a long upload that keeps making progress between drops', async () => {
    // Three drops in a row would exhaust two retries, but each one got further than the last.
    const { put } = script([
      new Error('dropped'), partial(99),
      new Error('dropped'), partial(199),
      new Error('dropped'), partial(299),
      ok('finally'),
    ])
    expect(await uploadToYouTube(file(1000), 'https://upload.example/session', { put, sleep: noSleep, retryDelays: [1, 1] })).toBe('finally')
  })
})
