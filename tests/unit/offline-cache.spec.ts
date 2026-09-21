// Emptying the offline copies. This is the part that keeps one person's
// directory off the next person's screen, so it is tested as carefully as
// anything that enforces a permission.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cachesToPurge, claimOfflineCaches, OFFLINE_CACHE_PREFIX, purgeOfflineCaches } from '../../app/utils/offline-cache'

// A stand-in for the browser's cache store.
const makeCaches = (names: string[]) => {
  const present = new Set(names)
  return {
    store: present,
    api: {
      keys: async () => [...present],
      delete: async (name: string) => present.delete(name),
    },
  }
}

const memoryStorage = () => {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal('localStorage', memoryStorage())
})

describe('choosing what to empty', () => {
  it('takes the caches holding member information', () => {
    expect(cachesToPurge([`${OFFLINE_CACHE_PREFIX}pages`, `${OFFLINE_CACHE_PREFIX}data`]))
      .toEqual([`${OFFLINE_CACHE_PREFIX}pages`, `${OFFLINE_CACHE_PREFIX}data`])
  })

  it('leaves the app’s own code alone', () => {
    // Emptying these would only mean downloading the app again, and they hold
    // nothing about anybody.
    expect(cachesToPurge(['workbox-precache-v2-https://lifegate.bible/', 'google-fonts', 'images']))
      .toEqual([])
  })

  it('takes only ours out of a mixed list', () => {
    const names = ['workbox-precache-v2-x', `${OFFLINE_CACHE_PREFIX}pages`, 'images', `${OFFLINE_CACHE_PREFIX}data`]
    expect(cachesToPurge(names)).toEqual([`${OFFLINE_CACHE_PREFIX}pages`, `${OFFLINE_CACHE_PREFIX}data`])
  })
})

describe('emptying them', () => {
  it('deletes every cache holding member information', async () => {
    const { store, api } = makeCaches([`${OFFLINE_CACHE_PREFIX}pages`, `${OFFLINE_CACHE_PREFIX}data`, 'workbox-precache-v2-x'])
    vi.stubGlobal('caches', api)
    expect(await purgeOfflineCaches()).toBe(2)
    expect([...store]).toEqual(['workbox-precache-v2-x'])
  })

  it('says nothing was emptied where the browser has no cache store', async () => {
    vi.stubGlobal('caches', undefined)
    expect(await purgeOfflineCaches()).toBe(0)
  })

  it('does not throw when the cache store refuses', async () => {
    vi.stubGlobal('caches', { keys: async () => { throw new Error('denied') } })
    await expect(purgeOfflineCaches()).resolves.toBe(0)
  })
})

describe('when the session changes', () => {
  const cached = () => [`${OFFLINE_CACHE_PREFIX}pages`, `${OFFLINE_CACHE_PREFIX}data`]

  it('empties everything when somebody signs out', async () => {
    const { store, api } = makeCaches(cached())
    vi.stubGlobal('caches', api)
    await claimOfflineCaches('person-a')
    await claimOfflineCaches(null)
    expect([...store]).toEqual([])
  })

  it('empties everything when a different person signs in', async () => {
    const { store, api } = makeCaches(cached())
    vi.stubGlobal('caches', api)
    await claimOfflineCaches('person-a')
    await claimOfflineCaches('person-b')
    expect([...store]).toEqual([])
  })

  it('empties copies it cannot vouch for, even on a first sign-in', async () => {
    // Nothing says these belong to the person signing in, so they go. One
    // download is the price of never showing somebody another member's details.
    const { store, api } = makeCaches(cached())
    vi.stubGlobal('caches', api)
    await claimOfflineCaches('person-a')
    expect([...store]).toEqual([])
  })

  it('keeps the copies it made for the person still signed in', async () => {
    const { store, api } = makeCaches([])
    vi.stubGlobal('caches', api)
    await claimOfflineCaches('person-a')
    // They browse, and the service worker stores their pages.
    cached().forEach(name => store.add(name))
    // The session is checked again on the next page load.
    await claimOfflineCaches('person-a')
    expect([...store]).toEqual(cached())
  })

  it('forgets the owner on sign-out, so the next person starts clean', async () => {
    const { store, api } = makeCaches(cached())
    vi.stubGlobal('caches', api)
    await claimOfflineCaches('person-a')
    await claimOfflineCaches(null)
    // person-a's own pages are re-cached while they browse again...
    store.add(`${OFFLINE_CACHE_PREFIX}pages`)
    // ...and person-b signing in on the same phone still clears them.
    await claimOfflineCaches('person-b')
    expect([...store]).toEqual([])
  })

  it('still empties when localStorage is unavailable', async () => {
    const { store, api } = makeCaches(cached())
    vi.stubGlobal('caches', api)
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    })
    // Without a remembered owner the check cannot run, so signing out must
    // still clear: that is the case that matters.
    await claimOfflineCaches(null)
    expect([...store]).toEqual([])
  })
})
