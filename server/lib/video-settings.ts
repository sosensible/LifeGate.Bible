// Changing the video host and YouTube keys from Church details.
import { createError } from 'h3'
import { recordAudit } from './audit.ts'
import { db } from './db.ts'
import { saveIntegrations, type IntegrationField } from './integration-secrets.ts'
import { normalizeCdnHost } from './bunny.ts'
import { holdsAllStoredVideos, prepareFolder } from './local-video.ts'
import { deleteConnection, loadConnection } from './youtube.ts'

// Applies what was entered. A string sets a value, null clears what was entered here, and a
// field left out (or blank) is unchanged. Changing Google's client id or secret ends the YouTube
// connection, because the lasting access it holds only works with the keys it was given under.
export const updateVideoSettings = (input: Partial<Record<IntegrationField, string | null | undefined>>, userId: string) => {
  const values = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== '' && value !== undefined)) as Partial<Record<IntegrationField, string | null>>
  // A folder is saved only if the server can really write to it.
  if (typeof values['local.path'] === 'string') {
    values['local.path'] = prepareFolder(values['local.path'])
    // Videos are already stored: the new folder must be where they are, or they would be lost to the site.
    // Changing to a different folder is done with Move, which copies and checks them first.
    if (!holdsAllStoredVideos(values['local.path'])) {
      throw createError({ statusCode: 409, statusMessage: 'Videos are already stored on this server, and they are not in that folder. Use “Move the stored videos” to change the folder; it copies and checks every one first.' })
    }
  }
  if (typeof values['bunny.cdnHost'] === 'string') values['bunny.cdnHost'] = normalizeCdnHost(values['bunny.cdnHost'])
  let disconnected = false
  let changed: IntegrationField[] = []
  db.transaction((tx) => {
    changed = saveIntegrations(tx, values, userId)
    if (changed.length) {
      recordAudit(tx, { actorUserId: userId, action: 'site.integrations', entityType: 'site', entityId: null, fields: changed, note: 'Changed the video host or YouTube keys' })
    }
    if (changed.some(name => name.startsWith('youtube.')) && loadConnection()) {
      deleteConnection()
      disconnected = true
      recordAudit(tx, { actorUserId: userId, action: 'youtube.disconnect', entityType: 'youtube', entityId: null, note: 'Disconnected because its Google keys changed' })
    }
  })
  return { changed, disconnected }
}
