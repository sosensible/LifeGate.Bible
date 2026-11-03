// Looking through the server's folders and making a new one, for choosing where video copies go.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lifegate-folder-browser-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

let lib: typeof import('../../server/lib/folder-browser')

beforeAll(async () => {
  // Starting with nothing chosen reads the saved folder setting, so the database needs its tables.
  const { db } = await import('../../server/lib/db')
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: 'server/database/migrations' })
  lib = await import('../../server/lib/folder-browser')
  for (const name of ['Beta', 'alpha', '10 later', '2 first', '.hidden']) mkdirSync(join(dir, 'tree', name), { recursive: true })
  writeFileSync(join(dir, 'tree', 'a-file.txt'), 'not a folder')
  mkdirSync(join(dir, 'elsewhere'))
  symlinkSync(join(dir, 'elsewhere'), join(dir, 'tree', 'linked'))
  symlinkSync(join(dir, 'tree', 'a-file.txt'), join(dir, 'tree', 'linked-file'))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const statusOf = (run: () => unknown) => {
  try {
    run()
  }
  catch (error) {
    return (error as { statusCode?: number }).statusCode
  }
  return undefined
}

describe('looking through folders', () => {
  it('lists only folders, in a natural order, leaving out hidden ones and files', () => {
    const listing = lib.listFolder(join(dir, 'tree'))
    expect(listing.folders.map(folder => folder.name)).toEqual(['2 first', '10 later', 'alpha', 'Beta', 'linked'])
    expect(listing.folders[0]!.path).toBe(join(dir, 'tree', '2 first'))
    expect(listing.path).toBe(join(dir, 'tree'))
    expect(listing.more).toBe(false)
  })

  it('says whether the server can save files in the folder, and how much room there is', () => {
    const open = lib.listFolder(join(dir, 'tree'))
    expect(open.writable).toBe(true)
    expect(open.freeBytes).toBeGreaterThan(0)
    const shut = join(dir, 'read-only')
    mkdirSync(shut)
    chmodSync(shut, 0o555)
    // Running as the superuser ignores permissions, so only check where they apply.
    if (process.getuid?.() !== 0) expect(lib.listFolder(shut).writable).toBe(false)
    chmodSync(shut, 0o755)
  })

  it('does not leave anything behind by looking', () => {
    const before = readdirSync(join(dir, 'tree')).length
    lib.listFolder(join(dir, 'tree'))
    expect(readdirSync(join(dir, 'tree')).length).toBe(before)
  })

  it('names the folder above, so a person can go up', () => {
    expect(lib.listFolder(join(dir, 'tree', 'alpha')).parent).toBe(join(dir, 'tree'))
  })

  it('sends the top of a drive up to the list of drives', () => {
    expect(lib.listFolder('/').parent).toBe('')
  })

  it('starts at the list of drives and mounted folders when nothing is chosen yet and no folder is set', () => {
    for (const listing of [lib.listFolder(), lib.listFolder('')]) {
      expect(listing.path).toBeNull()
      expect(listing.parent).toBeNull()
      expect(listing.folders.length).toBeGreaterThan(0)
    }
  })

  it('puts the main drive last, with its room and whether it can be written to', () => {
    const top = lib.listFolder('').folders
    const main = top.at(-1)!
    expect(main.path).toBe('/')
    expect(main.name).toMatch(/main drive/i)
    expect(main.freeBytes).toBeGreaterThan(0)
    expect(typeof main.writable).toBe('boolean')
    expect(top.filter(place => place.path === '/')).toHaveLength(1)
  })

  it('refuses a path that is not a full path, or tries to climb out', () => {
    expect(statusOf(() => lib.listFolder('tree'))).toBe(400)
    expect(statusOf(() => lib.listFolder(`${dir}/tree/../..`))).toBe(400)
  })

  it('says plainly when the folder is not there, or is a file', () => {
    expect(statusOf(() => lib.listFolder(join(dir, 'nope')))).toBe(404)
    expect(statusOf(() => lib.listFolder(join(dir, 'tree', 'a-file.txt')))).toBe(404)
  })

  it('says plainly when the server may not look inside', () => {
    const locked = join(dir, 'locked')
    mkdirSync(locked)
    chmodSync(locked, 0o000)
    // Running as the superuser ignores permissions, so only check where they apply.
    if (process.getuid?.() !== 0) expect(statusOf(() => lib.listFolder(locked))).toBe(403)
    chmodSync(locked, 0o755)
  })

  it('cuts a very long list short and says so', () => {
    const big = join(dir, 'big')
    mkdirSync(big)
    for (let i = 0; i < lib.MAX_FOLDERS + 3; i++) mkdirSync(join(big, `f${String(i).padStart(4, '0')}`))
    const listing = lib.listFolder(big)
    expect(listing.folders).toHaveLength(lib.MAX_FOLDERS)
    expect(listing.more).toBe(true)
  })
})

describe('making a folder', () => {
  it('makes one folder inside an existing one', () => {
    const made = lib.createFolder(join(dir, 'tree'), '  Teaching videos  ')
    expect(made).toEqual({ path: join(dir, 'tree', 'Teaching videos'), name: 'Teaching videos' })
    expect(existsSync(made.path)).toBe(true)
  })

  it('does not make the folders above it', () => {
    expect(statusOf(() => lib.createFolder(join(dir, 'missing-parent'), 'child'))).toBe(404)
    expect(existsSync(join(dir, 'missing-parent'))).toBe(false)
  })

  it('refuses a name that is a path, or would not be a plain folder name', () => {
    for (const name of ['', '   ', '.', '..', 'a/b', 'a\\b', '../escape', 'bad:name', 'what?', 'trailing.', 'x'.repeat(101), 'tab\there']) {
      expect(statusOf(() => lib.createFolder(join(dir, 'tree'), name)), name).toBe(400)
    }
    expect(existsSync(join(dir, 'escape'))).toBe(false)
  })

  it('says so when the name is taken, and leaves what is there alone', () => {
    expect(statusOf(() => lib.createFolder(join(dir, 'tree'), 'alpha'))).toBe(409)
  })

  it('says plainly when the server may not write there', () => {
    const closed = join(dir, 'closed')
    mkdirSync(closed)
    chmodSync(closed, 0o555)
    if (process.getuid?.() !== 0) expect(statusOf(() => lib.createFolder(closed, 'child'))).toBe(403)
    chmodSync(closed, 0o755)
  })
})

describe('reading the mount table', () => {
  const sample = [
    '22 28 0:21 / /proc rw,nosuid - proc proc rw',
    '29 1 0:27 / / rw,relatime - overlay overlay rw,lowerdir=/x',
    '40 29 8:17 /lifegate/videos /videos rw,relatime - ext4 /dev/sdb1 rw',
    '41 29 8:33 / /media/Second\\040Drive rw,relatime - xfs /dev/sdc1 rw',
    '42 29 0:50 / /app/.data rw,relatime - ext4 /dev/sda2 rw',
    '43 29 0:51 / /dev/shm rw - tmpfs shm rw',
    'not a mount line',
  ].join('\n')

  it('finds each mount point and its kind, decoding spaces in the name', () => {
    const mounts = lib.parseMountInfo(sample)
    expect(mounts.map(mount => mount.mountPoint)).toEqual(['/proc', '/', '/videos', '/media/Second Drive', '/app/.data', '/dev/shm'])
    expect(mounts.find(mount => mount.mountPoint === '/videos')?.fsType).toBe('ext4')
    expect(mounts.find(mount => mount.mountPoint === '/')?.fsType).toBe('overlay')
  })

  it('offers real disks, and leaves out the root, the system plumbing and the container image', () => {
    expect(lib.usableMountPoints(sample)).toEqual(['/videos', '/media/Second Drive', '/app/.data'])
  })

  it('ignores lines that are not mounts', () => {
    expect(lib.parseMountInfo('')).toEqual([])
    expect(lib.parseMountInfo('nonsense')).toEqual([])
  })
})
