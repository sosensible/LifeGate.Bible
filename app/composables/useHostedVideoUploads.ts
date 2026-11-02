import { Upload } from 'tus-js-client'
import type { AdminSermonView } from '#shared/sermons'

// Uploading a message's own video straight to the video host (see server/lib/hosted-video.ts).
// It lives here, not in the editor, so an upload carries on after the form is closed and the
// list can show how far along it is. Closing the browser tab stops it; choosing the same file
// again picks up where it left off.
interface Progress {
  percent: number
  phase: 'starting' | 'uploading' | 'failed'
  error?: string
}

const running = new Map<string, { upload: Upload, stop: () => void }>()
const listeners = new Set<(sermon: AdminSermonView) => void>()
let warned = false

export const useHostedVideoUploads = () => {
  const progress = useState<Record<string, Progress>>('hosted-video-uploads', () => ({}))
  const toast = useToast()

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

  const start = async (message: { id: string, title: string }, file: File, options: { publishWhenReady?: boolean } = {}) => {
    warnBeforeLeaving()
    progress.value[message.id] = { percent: 0, phase: 'starting' }
    try {
      const { sermon, ticket } = await $fetch<{ sermon: AdminSermonView, ticket: { endpoint: string, libraryId: string, videoId: string, expires: number, signature: string } }>(
        `/api/admin/sermons/${message.id}/hosted-video`, { method: 'POST' },
      )
      publish(sermon)
      if (options.publishWhenReady) {
        publish((await $fetch<{ sermon: AdminSermonView }>(`/api/admin/sermons/${message.id}/hosted-video/publish-when-ready`, { method: 'PUT', body: { on: true } })).sermon)
      }
      progress.value[message.id] = { percent: 0, phase: 'uploading' }
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
          onProgress: (sent, total) => { progress.value[message.id] = { percent: total ? Math.floor((sent / total) * 100) : 0, phase: 'uploading' } },
          onError: reject,
          onSuccess: () => resolve(),
        })
        running.set(message.id, { upload, stop: () => reject(new Error('cancelled')) })
        upload.start()
      })
      delete progress.value[message.id]
      toast.add({ title: `“${message.title}” uploaded`, description: 'It shows as ready when the video host has finished preparing it.', color: 'success', icon: 'i-lucide-circle-check' })
      watchUntilReady(message.id)
    }
    catch (error) {
      // A cancelled upload is not an error.
      if (progress.value[message.id]) {
        progress.value[message.id] = { percent: progress.value[message.id]!.percent, phase: 'failed', error: apiErrorMessage(error, 'The upload stopped. Choose the file again to resume it.') }
        toast.add({ title: 'Video not uploaded', description: progress.value[message.id]!.error, color: 'error', icon: 'i-lucide-circle-alert' })
      }
    }
    finally {
      running.delete(message.id)
    }
  }

  const cancel = (id: string) => {
    const job = running.get(id)
    delete progress.value[id]
    job?.stop()
    void job?.upload.abort(true)
  }

  const dismiss = (id: string) => {
    delete progress.value[id]
  }

  return { progress, start, cancel, dismiss, onChanged, watchUntilReady }
}
