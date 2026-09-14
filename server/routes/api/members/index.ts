export default defineEventHandler(async (event) => {
  // Guard updated for Better Auth. The D1 queries below predate the new schema
  // and are rewritten in a later phase.
  await requirePermission(event, { people: ['viewContact'] })

  try {
    const db = event.context.cloudflare?.env?.db
    if (!db) {
      throw new Error('Database not available')
    }

    const stmt = db.prepare(
      `SELECT m.id, m.user_id, u.email, u.name, m.role, m.family_unit, m.phone, m.address, m.birthday, m.ministries
       FROM members m
       JOIN users u ON m.user_id = u.id
       ORDER BY u.name ASC`,
    )

    const members = await stmt.all()

    return {
      success: true,
      members: members.results || [],
    }
  }
  catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch members',
    })
  }
})
