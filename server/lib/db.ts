// SQLite via better-sqlite3 + Drizzle (stable 0.45). One file for the whole app:
// Better Auth's tables and Lifegate's own tables live side by side.
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../database/schema/index.ts'

const createDb = () => {
  const file = resolve(process.env.DATABASE_PATH || '.data/lifegate.db')
  mkdirSync(dirname(file), { recursive: true })

  const sqlite = new Database(file)
  // WAL lets reads continue during writes; foreign keys are off by default in SQLite.
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  return drizzle(sqlite, { schema })
}

// Reuse one connection across dev hot-reloads instead of leaking file handles.
const globalForDb = globalThis as unknown as { __lifegateDb?: ReturnType<typeof createDb> }

export const db = (globalForDb.__lifegateDb ??= createDb())
