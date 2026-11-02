// Keeping a secret in the database so a copy of the database alone cannot read it. AES-256-GCM,
// with a key made from the site's own BETTER_AUTH_SECRET. It protects backups and a leaked database
// file; it does not protect against someone who has taken over the running server, which holds
// both. If BETTER_AUTH_SECRET is ever changed, what was kept can no longer be read and must be
// entered again.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const secret = () => {
  const value = process.env.BETTER_AUTH_SECRET
  if (!value) throw new Error('BETTER_AUTH_SECRET is not set')
  return value
}

// The derivation is deliberately slow (about 20 ms, on the one thread the site runs on) and the
// secret does not change while the site runs, so each key is made once.
const keys = new Map<string, Buffer>()
const boxKey = (key: string) => {
  let derived = keys.get(key)
  if (!derived) keys.set(key, derived = scryptSync(key, 'lifegate-youtube-token', 32))
  return derived
}
const b64 = (buffer: Buffer) => buffer.toString('base64url')

export const encryptToken = (token: string, key = secret()) => {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', boxKey(key), iv)
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return `${b64(iv)}.${b64(cipher.getAuthTag())}.${b64(body)}`
}

export const decryptToken = (stored: string, key = secret()) => {
  const [iv, tag, body] = stored.split('.').map(part => Buffer.from(part ?? '', 'base64url'))
  if (!iv?.length || !tag?.length || !body?.length) throw new Error('The stored secret is damaged')
  const decipher = createDecipheriv('aes-256-gcm', boxKey(key), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
}
