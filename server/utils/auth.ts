export default defineEventHandler(async (event) => {
  const token = getCookie(event, 'auth_token')

  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Not authenticated',
    })
  }

  try {
    const db = event.context.cloudflare?.env?.db
    if (!db) {
      throw new Error('Database not available')
    }

    const stmt = db.prepare(
      'SELECT id, email, name, role FROM users WHERE auth_token = ? LIMIT 1',
    )
    const result = await stmt.bind(token).first()

    if (!result) {
      throw new Error('Invalid token')
    }

    event.context.user = result
    return result
  }
  catch (err: any) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication failed',
    })
  }
})

export const requireAuth = async (event: any) => {
  const user = event.context.user

  if (!user) {
    const token = getCookie(event, 'auth_token')
    if (!token) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Not authenticated',
      })
    }

    const db = event.context.cloudflare?.env?.db
    const stmt = db.prepare(
      'SELECT id, email, name, role FROM users WHERE auth_token = ? LIMIT 1',
    )
    const result = await stmt.bind(token).first()

    if (!result) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid token',
      })
    }

    event.context.user = result
    return result
  }

  return user
}
