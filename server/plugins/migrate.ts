// Bring the database up to date when the server starts.
//
// Until now migrations were applied by hand with `npm run db:migrate`, which
// works when the database and the developer are on the same machine. A
// container has neither drizzle-kit nor the project source in it, and a fresh
// one starts against a volume that may be empty, so the schema has to be the
// server's own responsibility.
//
// Drizzle records what it has applied in its own table, so this is idempotent:
// a container that restarts with nothing to do says so and carries on. It runs
// before the first request is served, which is what makes a deploy carrying a
// schema change safe to do by restarting the container.
//
// SQLite is single-writer and one container owns the file, so there is no race
// to guard against. If that ever stops being true -- two containers, one
// volume -- this needs a lock, and SQLite will not give you one for free.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from '../lib/db.ts'

export default defineNitroPlugin(() => {
  if (process.env.SKIP_MIGRATIONS === '1') {
    console.log('[migrate] SKIP_MIGRATIONS=1, leaving the schema alone.')
    return
  }

  // Copied into the image next to .output; overridable for anything unusual.
  const folder = resolve(process.env.MIGRATIONS_PATH || 'server/database/migrations')

  if (!existsSync(folder)) {
    // Refusing beats starting: an app serving requests against a schema that
    // was never applied fails in ways that look like data loss.
    throw new Error(
      `[migrate] No migrations at ${folder}. Set MIGRATIONS_PATH, or SKIP_MIGRATIONS=1 if the schema is managed elsewhere.`,
    )
  }

  const started = Date.now()
  migrate(db, { migrationsFolder: folder })
  console.log(`[migrate] Schema up to date (${Date.now() - started}ms).`)
})
