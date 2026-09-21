// Emptying what the app kept on the phone.
//
// The service worker stores member pages and their answers so the app works
// without a signal. Those answers are filtered for the person who asked: a
// deacon's directory is not an ordinary member's. So the moment a session ends,
// or a different person signs in on the same phone, the copies have to go —
// otherwise the next person is served the last person's view.
//
// The caches the app's own code lives in are left alone: there is nothing about
// anybody in a stylesheet, and clearing them would only mean downloading the
// app again.

// Every cache holding something about a person is named with this prefix, so
// what to empty is never a matter of guessing.
export const OFFLINE_CACHE_PREFIX = 'lifegate-offline-'

// Kept separate from the browser call so the choice can be tested.
export const cachesToPurge = (names: string[]) =>
  names.filter(name => name.startsWith(OFFLINE_CACHE_PREFIX))

// Who the caches currently belong to. Held in localStorage rather than memory,
// because the answer has to survive the app being closed and reopened.
const OWNER_KEY = 'lifegate:offline-cache-owner'

const readOwner = () => {
  try {
    return localStorage.getItem(OWNER_KEY)
  }
  catch {
    return null
  }
}

const writeOwner = (userId: string | null) => {
  try {
    if (userId) localStorage.setItem(OWNER_KEY, userId)
    else localStorage.removeItem(OWNER_KEY)
  }
  catch {
    // Private browsing, or storage turned off. The purge below still runs; only
    // the "has the person changed" check is lost, so it errs towards purging.
  }
}

// Returns how many caches were emptied, which is what the tests assert on.
export const purgeOfflineCaches = async (): Promise<number> => {
  writeOwner(null)
  if (typeof caches === 'undefined') return 0
  try {
    const doomed = cachesToPurge(await caches.keys())
    await Promise.all(doomed.map(name => caches.delete(name)))
    return doomed.length
  }
  catch {
    return 0
  }
}

// Called whenever the session is set. A different person — or nobody — means
// the stored copies belong to someone else and are emptied before they can be
// read. The same person signing in again keeps theirs.
//
// Callers decide whether they are in a browser; this only asks whether there is
// a cache store to empty, which is what makes it testable.
export const claimOfflineCaches = async (userId: string | null) => {
  if (!userId) return purgeOfflineCaches()
  // Anything but a positive match empties them, including not knowing whose
  // they are. Being wrong the safe way costs one download; being wrong the
  // other way shows somebody another member's contact details.
  if (readOwner() !== userId) await purgeOfflineCaches()
  writeOwner(userId)
}
