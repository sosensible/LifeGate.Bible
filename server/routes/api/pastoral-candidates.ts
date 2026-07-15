export default defineEventHandler(async (event) => {
  const formData = await readFormData(event)

  const positionId = formData.get('positionId')
  const firstName = formData.get('firstName')
  const lastName = formData.get('lastName')
  const email = formData.get('email')
  const phone = formData.get('phone')
  const yearsExperience = formData.get('yearsExperience')
  const education = formData.get('education')
  const statement = formData.get('statement')
  const references = formData.get('references')
  const resume = formData.get('resume') as File

  if (!firstName || !lastName || !email || !positionId || !education || !statement) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required fields',
    })
  }

  try {
    const db = event.context.cloudflare?.env?.db
    const env = event.context.cloudflare?.env

    if (!db) {
      throw new Error('Database not available')
    }

    // Log application
    const stmt = db.prepare(
      `INSERT INTO pastoral_applications (position_id, first_name, last_name, email, phone, years_experience, education, statement, references, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
    )

    const result = await stmt.bind(
      positionId,
      firstName,
      lastName,
      email,
      phone || null,
      yearsExperience || null,
      education,
      statement,
      references || null,
    ).run()

    // TODO: Store resume file and send confirmation emails

    return {
      success: true,
      message: 'Application submitted successfully',
      applicationId: result.meta.last_row_id,
    }
  }
  catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: err.message || 'Failed to submit application',
    })
  }
})
