export default defineEventHandler(async (event) => {
  // Guard updated for Better Auth. The D1 queries below predate the new schema
  // and are rewritten in a later phase.
  await requirePermission(event, { sermon: ['create'] })

  const formData = await readFormData(event)
  
  const title = formData.get('title')?.toString()
  const series = formData.get('series')?.toString()
  const date = formData.get('date')?.toString()
  const pastor = formData.get('pastor')?.toString()
  const description = formData.get('description')?.toString()
  const videoFile = formData.get('video') as File | null
  const audioFile = formData.get('audio') as File | null
  const pdfFile = formData.get('pdf') as File | null

  if (!title || !date) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Title and date are required',
    })
  }

  try {
    const db = event.context.cloudflare?.env?.db
    if (!db) {
      throw new Error('Database not available')
    }

    // Handle file uploads (Cloudflare R2 or simple storage)
    let videoUrl: string | null = null
    let audioUrl: string | null = null
    let pdfUrl: string | null = null

    // In production, upload to R2 and get signed URLs
    if (videoFile) {
      const buffer = await videoFile.arrayBuffer()
      videoUrl = `/uploads/sermons/${Date.now()}-${videoFile.name}`
    }
    if (audioFile) {
      const buffer = await audioFile.arrayBuffer()
      audioUrl = `/uploads/sermons/${Date.now()}-${audioFile.name}`
    }
    if (pdfFile) {
      const buffer = await pdfFile.arrayBuffer()
      pdfUrl = `/uploads/sermons/${Date.now()}-${pdfFile.name}`
    }

    // Insert sermon into D1
    const stmt = db.prepare(
      `INSERT INTO sermons (title, series, date, pastor, description, video_url, audio_url, pdf_url) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    const result = await stmt.bind(
      title,
      series || null,
      date,
      pastor || null,
      description || null,
      videoUrl,
      audioUrl,
      pdfUrl,
    ).run()

    return {
      success: true,
      sermon: {
        id: result.meta.last_row_id,
        title,
        series,
        date,
        pastor,
        description,
        video_url: videoUrl,
        audio_url: audioUrl,
        pdf_url: pdfUrl,
      },
    }
  }
  catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: err.message || 'Failed to upload sermon',
    })
  }
})
