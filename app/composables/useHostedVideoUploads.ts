import { Upload } from 'tus-js-client'
import type { AdminSermonView } from '#shared/sermons'
import { uploadToYouTube } from '#shared/youtube-upload'

// Sending a message's video to where it lives: the church's video host, the church's YouTube
// channel, or both (see server/lib/hosted-video.ts and server/lib/youtube.ts). It lives here,
// not in the editor, so an upload carries on after the form is closed and the list can show how
// far along it is. Closing the browser tab stops it; choosing the same file again picks up where
// it left off.
interface Progress {
  percent: number
  phase: 'starting' | 'uploading' | 'failed'
  // Which one is being sent to now.
  target: 'local' | 'host' | 'youtube'
  error?: string
}

const running = new Map<string, AbortController>()
const listeners = new Set<(sermon: AdminSermonView) => void>()
let warned = false

export const useHostedVideoUploads = () => {
  const progress = useState<Record<string, Progress>>('hosted-video-uploads', () => ({}))
  const toast = useToast()
  const { load: loadTargets } = useVideoTargets()

  const publish = (sermon: AdminSermonView) => listeners.forEach(listener => listener(sermon))

  // Tell me whenever a message changes because of an upload, a check or a removal.
  const onChanged = (handler: (sermon: AdminSermonView) => void) => {
    listeners.add(handler)
    onScopeDispose(() => listeners.delete(handler))
  }

  const warnBeforeLeaving = () => {
    if (warned || !import.meta.client) return
    warned = true
    window.addEventListener('beforeunload', (event) => {
      if (running.size) event.preventDefault()
    })
  }

  // While the host prepares the video, look again every 15 seconds, for up to 30 minutes.
  const watchUntilReady = (id: string) => {
    let tries = 0
    const timer = setInterval(async () => {
      tries += 1
      try {
        const { sermon } = await $fetch<{ sermon: AdminSermonView }>(`/api/admin/sermons/${id}/hosted-video`)
        publish(sermon)
        if (sermon.hosted?.state !== 'processing') clearInterval(timer)
      }
      catch {
        // Try again at the next tick.
      }
      if (tries >= 120) clearInterval(timer)
    }, 15000)
  }

  // A cancelled upload may still report a last byte count; it is ignored.
  const set = (id: string, value: Progress) => {
    if (running.has(id)) progress.value[id] = value
  }

  // To the church server's own folder, in resumable pieces small enough for the tunnel. It is
  // the master copy: kept first, so the video survives the video host or YouTube going away.
  const sendToLocal = async (message: { id: string, title: string }, file: File, signal: AbortSignal, postToYouTube: boolean) => {
    set(message.id, { percent: 0, phase: 'starting', target: 'local' })
    await new Promise<void>((resolve, reject) => {
      const upload = new Upload(file, {
        endpoint: '/api/admin/local-upload',
        chunkSize: 50 * 1024 * 1024,
        retryDelays: [0, 3000, 5000, 10000, 20000, 60000],
        metadata: { sermonId: message.id, filename: file.name, filetype: file.type || 'video/mp4', postToYouTube: String(postToYouTube) },
        onProgress: (sent, total) => set(message.id, { percent: total ? Math.floor((sent / total) * 100) : 0, phase: 'uploading', target: 'local' }),
        onError: reject,
        onSuccess: () => resolve(),
      })
      signal.addEventListener('abort', () => {
        void upload.abort(true)
        reject(new Error('cancelled'))
      })
      upload.start()
    })
    const { sermon } = await $fetch<{ sermon: AdminSermonView }>(`/api/admin/sermons/${message.id}`)
    publish(sermon)
  }

  // To the church's video host, resumable and signed by the server.
  const sendToHost = async (message: { id: string, title: string }, file: File, publishWhenReady: boolean, signal: AbortSignal) => {
    set(message.id, { percent: 0, phase: 'starting', target: 'host' })
    const { sermon, ticket } = await $fetch<{ sermon: AdminSermonView, ticket: { endpoint: string, libraryId: string, videoId: string, expires: number, signature: string } }>(
      `/api/admin/sermons/${message.id}/hosted-video`, { method: 'POST' },
    )
    publish(sermon)
    if (publishWhenReady) {
      publish((await $fetch<{ sermon: AdminSermonView }>(`/api/admin/sermons/${message.id}/hosted-video/publish-when-ready`, { method: 'PUT', body: { on: true } })).sermon)
    }
    set(message.id, { percent: 0, phase: 'uploading', target: 'host' })
    await new Promise<void>((resolve, reject) => {
      const upload = new Upload(file, {
        endpoint: ticket.endpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000, 60000],
        headers: {
          AuthorizationSignature: ticket.signature,
          AuthorizationExpire: String(ticket.expires),
          VideoId: ticket.videoId,
          LibraryId: ticket.libraryId,
        },
        metadata: { filetype: file.type || 'video/mp4', title: message.title },
        onProgress: (sent, total) => set(message.id, { percent: total ? Math.floor((sent / total) * 100) : 0, phase: 'uploading', target: 'host' }),
        onError: reject,
        onSuccess: () => resolve(),
      })
      signal.addEventListener('abort', () => {
        void upload.abort(true)
        reject(new Error('cancelled'))
      })
      upload.start()
    })
    watchUntilReady(message.id)
  }

  // To the church's YouTube channel, from this browser straight to YouTube, as unlisted.
  const sendToYouTube = async (message: { id: string }, file: File, publishNow: boolean, signal: AbortSignal) => {
    set(message.id, { percent: 0, phase: 'starting', target: 'youtube' })
    const { uploadUrl } = await $fetch<{ uploadUrl: string }>(`/api/admin/sermons/${message.id}/youtube-upload`, { method: 'POST', body: { size: file.size, type: file.type } })
    set(message.id, { percent: 0, phase: 'uploading', target: 'youtube' })
    const videoId = await uploadToYouTube(file, uploadUrl, {
      put: xhrPut,
      signal,
      onProgress: (sent, total) => set(message.id, { percent: Math.floor((sent / total) * 100), phase: 'uploading', target: 'youtube' }),
    })
    let { sermon } = await $fetch<{ sermon: AdminSermonView }>(`/api/admin/sermons/${message.id}/youtube-uploaded`, { method: 'POST', body: { videoId } })
    // With no church video copy to wait for, a YouTube video is playable at once.
    if (publishNow) sermon = (await $fetch<{ sermon: AdminSermonView }>(`/api/admin/sermons/${message.id}`, { method: 'PATCH', body: { status: 'published' } })).sermon
    publish(sermon)
  }

  const start = async (message: { id: string, title: string }, file: File, options: { publishWhenReady?: boolean, youtube?: boolean } = {}) => {
    warnBeforeLeaving()
    const controller = new AbortController()
    running.set(message.id, controller)
    set(message.id, { percent: 0, phase: 'starting', target: 'host' })
    try {
      const targets = await loadTargets()
      const toLocal = targets.local
      // With a copy kept on the church server, the server sends it on to the video host and YouTube itself.
      const toHost = targets.host && !toLocal
      const wantsYouTube = targets.youtube && options.youtube !== false
      const toYouTube = wantsYouTube && !toLocal
      if (!toLocal && !toHost && !toYouTube) throw new Error('No video host, YouTube channel or local folder is set up yet.')
      if (toLocal) {
        await sendToLocal(message, file, controller.signal, wantsYouTube)
        // The server has queued the sends by now, so a request to publish when it is ready can be made.
        if ((targets.host || wantsYouTube) && options.publishWhenReady) {
          publish((await $fetch<{ sermon: AdminSermonView }>(`/api/admin/sermons/${message.id}/hosted-video/publish-when-ready`, { method: 'PUT', body: { on: true } })).sermon)
        }
        if (targets.host) watchUntilReady(message.id)
      }
      if (toHost) await sendToHost(message, file, Boolean(options.publishWhenReady), controller.signal)
      if (toYouTube) await sendToYouTube(message, file, Boolean(options.publishWhenReady) && !toHost, controller.signal)
      delete progress.value[message.id]
      toast.add({
        title: `“${message.title}” uploaded`,
        description: toHost ? 'It shows as ready when the video host has finished preparing it.' : toLocal ? (targets.host || wantsYouTube ? 'It is stored on the church server, and is being sent on in the background.' : 'It is stored on the church server.') : 'It is on the church’s YouTube channel.',
        color: 'success',
        icon: 'i-lucide-circle-check',
      })
    }
    catch (error) {
      // A cancelled upload is not an error.
      const current = controller.signal.aborted ? undefined : progress.value[message.id]
      if (current) {
        const failed = { ...current, phase: 'failed' as const, error: apiErrorMessage(error, 'The upload stopped. Choose the file again to resume it.') }
        progress.value[message.id] = failed
        toast.add({ title: current.target === 'youtube' ? 'Not posted to YouTube' : current.target === 'local' ? 'Not stored on the church server' : 'Video not uploaded', description: failed.error, color: 'error', icon: 'i-lucide-circle-alert' })
      }
    }
    finally {
      if (running.get(message.id) === controller) running.delete(message.id)
    }
  }

  const cancel = (id: string) => {
    const controller = running.get(id)
    running.delete(id)
    delete progress.value[id]
    controller?.abort()
  }

  const dismiss = (id: string) => {
    delete progress.value[id]
  }

  return { progress, start, cancel, dismiss, onChanged, watchUntilReady }
}
