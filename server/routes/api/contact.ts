import { sendEmail, contactEmailTemplate } from '~~/server/utils/email'

export default defineEventHandler(async (event) => {
  const { name, email, phone, subject, message } = await readBody(event)

  if (!name || !email || !subject || !message) {
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

    // Log contact message
    const stmt = db.prepare(
      `INSERT INTO contact_messages (name, email, phone, subject, message, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    )

    await stmt.bind(name, email, phone || null, subject, message).run()

    // Send confirmation email to sender
    const { html, text } = contactEmailTemplate(name, email, subject, message)
    await sendEmail(env, email, `We received your message: ${subject}`, html, text)

    // Log event
    console.log(`Contact message from ${name} (${email}) received and notifications sent`)

    // Send notification to admin
    const adminTemplate = contactEmailTemplate(name, email, subject, message)
    await sendEmail(env, 'info@lifegate.bible', `New Contact Form: ${subject}`, adminTemplate.html, adminTemplate.text)

    return {
      success: true,
      message: 'Message sent successfully',
    }
  }
  catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: err.message || 'Failed to send message',
    })
  }
})
