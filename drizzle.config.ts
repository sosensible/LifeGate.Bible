import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './server/database/schema/index.ts',
  out: './server/database/migrations',
  dbCredentials: {
    url: process.env.DATABASE_PATH || '.data/lifegate.db',
  },
})
