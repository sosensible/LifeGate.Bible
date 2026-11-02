// Sending to YouTube from the browser: a request that can report how much has gone (shared/youtube-upload.ts).
import type { Put } from '#shared/youtube-upload'

export const xhrPut: Put = (url, body, headers, onSent, signal) => new Promise((resolve, reject) => {
  const request = new XMLHttpRequest()
  signal?.addEventListener('abort', () => request.abort())
  request.open('PUT', url)
  for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value)
  request.upload.onprogress = event => onSent?.(event.loaded)
  request.onload = () => resolve({ status: request.status, range: request.getResponseHeader('Range'), body: request.responseText })
  request.onerror = () => reject(new Error('The connection dropped'))
  request.onabort = () => reject(new Error('Cancelled'))
  request.send(body)
})
