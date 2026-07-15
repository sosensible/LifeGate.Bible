import { sendEmail, giftEmailTemplate, adminGiftNotificationTemplate } from '~~/server/utils/email'

export default defineEventHandler(async (event) => {
  const { amount, firstName, lastName, email, phone, fund, notes, type, autoRenew } = await readBody(event)

  if (!amount || !firstName || !lastName || !email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required fields',
    })
  }

  try {
    const db = event.context.cloudflare?.env?.db
    if (!db) {
      throw new Error('Database not available')
    }

    // Log the gift
    const stmt = db.prepare(
      `INSERT INTO gifts (amount, first_name, last_name, email, phone, fund, notes, type, auto_renew, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )

    const result = await stmt.bind(amount, firstName, lastName, email, phone || null, fund, notes || null, type, autoRenew ? 1 : 0).run()

    // Send thank you email to donor
    const { html, text } = giftEmailTemplate(firstName, amount, fund)
    await sendEmail(event.context.cloudflare?.env, email, 'Thank You for Your Gift', html, text)

    // Send notification to admin
    const adminTemplate = adminGiftNotificationTemplate(firstName, lastName, amount, fund, email)
    await sendEmail(event.context.cloudflare?.env, 'info@lifegate.bible', `New Gift Received: $${amount.toFixed(2)}`, adminTemplate.html, adminTemplate.text)

    // TODO: Integrate with Stripe/payment processor
    const checkoutUrl = `/giving/checkout?id=${result.meta.last_row_id}`

    return {
      success: true,
      message: 'Gift recorded',
      checkoutUrl,
    }
  }
  catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: err.message || 'Failed to process gift',
    })
  }
})
