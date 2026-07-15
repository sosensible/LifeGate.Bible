export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  if (user.role !== 'admin' && user.role !== 'pastor') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin access required',
    })
  }

  const id = getRouterParam(event, 'id')
  const { role, phone, address, birthday, familyUnit, ministries } = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Member ID required',
    })
  }

  try {
    const db = event.context.cloudflare?.env?.db
    if (!db) {
      throw new Error('Database not available')
    }

    const stmt = db.prepare(
      `UPDATE members SET role = ?, phone = ?, address = ?, birthday = ?, family_unit = ?, ministries = ?
       WHERE id = ?`,
    )
    await stmt.bind(role || 'member', phone || null, address || null, birthday || null, familyUnit || null, ministries || null, id).run()

    return { success: true, message: 'Member updated' }
  }
  catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update member',
    })
  }
})
