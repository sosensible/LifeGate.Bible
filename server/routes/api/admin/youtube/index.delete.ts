// Disconnects the church's YouTube channel: Google is told to forget the site's access, and
// the saved key is deleted. Videos already on YouTube stay where they are.
import { recordAudit } from '../../../../lib/audit.ts'
import { db } from '../../../../lib/db.ts'
import { decryptToken, deleteConnection, loadConnection, revokeToken, youtubeStatus } from '../../../../lib/youtube.ts'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { integrations: ['manage'] })
  const connection = loadConnection()
  if (connection) {
    await revokeToken(decryptToken(connection.refreshTokenEncrypted)).catch(() => {})
    db.transaction((tx) => {
      deleteConnection()
      recordAudit(tx, { actorUserId: session.user.id, action: 'youtube.disconnect', entityType: 'youtube', entityId: connection.channelId, note: `Disconnected ${connection.channelTitle}` })
    })
  }
  return youtubeStatus()
})
