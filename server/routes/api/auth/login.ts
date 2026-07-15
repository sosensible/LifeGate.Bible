export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event)

  try {
    const db = event.context.cloudflare?.env?.db
    if (!db) {
      throw new Error('Database not available')
    }

    // Query D1 for user
    const stmt = db.prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?')
    const user = await stmt.bind(email).first()

    if (!user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid email or password',
      })
    }

    // In production, use bcrypt or similar to compare password
    // For now, simple comparison (UNSAFE - for demo only)
    if (user.password_hash !== password) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid email or password',
      })
    }

    // Generate token (in production, use JWT)
    const token = 'token_' + user.id + '_' + Date.now()

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    }
  }
  catch (err: any) {
    if (err.statusCode) {
      throw err
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Authentication error',
    })
  }
})
