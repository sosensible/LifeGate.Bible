export default defineEventHandler(async (event) => {
  try {
    const db = event.context.cloudflare?.env?.db
    if (!db) {
      throw new Error('Database not available')
    }

    const stmt = db.prepare(
      'SELECT id, title, series, date, pastor, description, video_url, audio_url, pdf_url, created_at FROM sermons ORDER BY date DESC LIMIT 20',
    )

    const sermons = await stmt.all()

    return {
      success: true,
      sermons: sermons.results || [],
    }
  }
  catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch sermons',
    })
  }
})
