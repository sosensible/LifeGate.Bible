// The audit trail: who changed what, and when.
import { auditLog } from '../database/schema/index.ts'
import { db } from './db.ts'

type Db = typeof db
// A transaction handle has the same query API as `db`.
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

// Records WHICH fields changed, never their values, so the audit trail does
// not become a second copy of everyone's personal information.
export const recordAudit = (
  tx: Tx | Db,
  entry: { actorUserId: string, action: string, entityType: string, entityId: string | null, fields?: string[], note?: string },
) => {
  tx.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    details: { fields: entry.fields, note: entry.note },
  }).run()
}
