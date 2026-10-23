// Draws the neutral placeholder mark the site ships with: a plain gold cross, on a
// transparent background for the page, and on a green square for icons.
//
//   node scripts/make-placeholder-brand.ts
//
// It writes the files in public/ that a browser, a phone's home screen and the
// service worker expect, so a church that reuses this code starts with a mark that
// is nobody's. Each church replaces it from /admin/site (Church details); the
// replacement is stored in that church's own data, never in this repository.
//
// No image library: the PNG is written by hand (zlib is built into Node).
import { mkdirSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'

const GREEN: [number, number, number] = [0x16, 0x48, 0x26]
const GOLD: [number, number, number] = [0xC9, 0xA2, 0x27]
const SAMPLES = 4

// A Latin cross centred in the unit square. `span` is how much of the height it fills.
const inCross = (x: number, y: number, span: number) => {
  const top = 0.5 - span / 2
  const arm = span * 0.16
  const bar = span * 0.62
  const crossbarY = top + span * 0.34
  const upright = Math.abs(x - 0.5) <= arm / 2 && y >= top && y <= top + span
  const crossbar = Math.abs(y - crossbarY) <= arm / 2 && Math.abs(x - 0.5) <= bar / 2
  return upright || crossbar
}

// `background`: null is transparent; a colour fills the square edge to edge.
const render = (size: number, background: [number, number, number] | null, span: number) => {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0
    for (let px = 0; px < size; px++) {
      let covered = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          if (inCross((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size, span)) covered++
        }
      }
      const c = covered / (SAMPLES * SAMPLES)
      const at = py * (size * 4 + 1) + 1 + px * 4
      const base = background ?? GOLD
      raw[at] = Math.round(base[0] + (GOLD[0] - base[0]) * c)
      raw[at + 1] = Math.round(base[1] + (GOLD[1] - base[1]) * c)
      raw[at + 2] = Math.round(base[2] + (GOLD[2] - base[2]) * c)
      raw[at + 3] = background ? 255 : Math.round(c * 255)
    }
  }
  return png(size, size, raw)
}

const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type), data])
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), 8 + data.length)
  return out
}

const png = (width: number, height: number, rows: Buffer) => {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/images', { recursive: true })
// The page: transparent, so it sits on the header and on white alike.
for (const width of [216, 432, 864]) writeFileSync(`public/images/logo-${width}.png`, render(width, null, 0.92))
// Icons: green square, cross inside the "safe zone" that Android crops to a circle.
for (const size of [16, 32, 48]) writeFileSync(`public/favicon-${size}x${size}.png`, render(size, GREEN, 0.7))
writeFileSync('public/apple-touch-icon.png', render(180, GREEN, 0.6))
writeFileSync('public/icon-192.png', render(192, GREEN, 0.6))
writeFileSync('public/icon-512.png', render(512, GREEN, 0.6))
console.log('Wrote the neutral placeholder mark into public/.')
