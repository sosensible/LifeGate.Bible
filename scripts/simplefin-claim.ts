// Connect Stewardship to SimpleFIN Bridge.
//
//   npm run simplefin:claim -- <setup token>
//
// Create a setup token at https://beta-bridge.simplefin.org (My Account ->
// Apps -> New connection). A token works once. This prints the access URL,
// which holds credentials: put it in .env (or the container's environment) as
// SIMPLEFIN_ACCESS_URL and restart. Nothing is written to the database.
import { claimSetupToken } from '../server/lib/simplefin-protocol.ts'

const [token] = process.argv.slice(2)

if (!token) {
  console.error('Usage: npm run simplefin:claim -- <setup token>')
  process.exit(1)
}

try {
  const accessUrl = await claimSetupToken(token)
  console.log('Add this line to .env (keep it secret), then restart the site:\n')
  console.log(`SIMPLEFIN_ACCESS_URL=${accessUrl}`)
}
catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
