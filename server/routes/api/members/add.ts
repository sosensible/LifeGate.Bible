export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  if (user.role !== 'admin' && user.role !== 'pastor') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin access required',
    })
  }

  const { name, email, role, phone, address, birthday, familyUnit, ministries } = await readBody(event)

  if (!name || !email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Name and email are required',
    })
  }

  try {
    const db = event.context.cloudflare?.env?.db
    if (!db) {
      throw new Error('Database not available')
    }

    // Create user
    const userStmt = db.prepare(
      'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
    )
    const userResult = await userStmt.bind(email, name, 'temp_password_123', 'member').run()
    const userId = userResult.meta.last_row_id

    // Create member profile
    const memberStmt = db.prepare(
      `INSERT INTO members (user_id, role, family_unit, phone, address, birthday, ministries)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    await memberStmt.bind(userId, role || 'member', familyUnit || null, phone || null, address || null, birthday || null, ministries || null).run()

    return {
      success: true,
      message: 'Member added successfully',
      member: {
        id: userId,
        name,
        email,
        role,
        phone,
        address,
        birthday,
        familyUnit,
        ministries,
      },
    }
  }
  catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: err.message || 'Failed to add member',
    })
  }
})
