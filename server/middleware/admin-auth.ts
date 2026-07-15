export default defineEventHandler(async (event) => {
  // Nitro runs every file in server/middleware/ on ALL requests. Guard only the
  // admin-only API surface so public pages and other routes pass through.
  // (Do not return a value here — returning from middleware would short-circuit
  // the actual route handler.)
  if (!event.path.startsWith('/api/members')) {
    return
  }

  const user = await requireAuth(event)

  if (user.role !== 'admin' && user.role !== 'pastor') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin access required',
    })
  }
})
