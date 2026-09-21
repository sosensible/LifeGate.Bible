// v1 marketing-site mail helpers.
//
// Only server/routes/api/giving.ts still uses these, and that route is a stub
// that cannot work: it inserts into a `gifts` table whose real schema belongs
// to stewardship (count_id NOT NULL, foreign-keyed to an offering count), and
// there is no payment processor. It is knowingly left broken for now.
//
// The contact form no longer comes through here -- it uses server/lib/mail.ts
// like the rest of the app. When giving is decided, this file and the
// `env.EMAIL` binding below should go with it, leaving one mail stack.
import { escapeHtml } from '../lib/mail.ts'

export const sendEmail = async (env: any, to: string, subject: string, html: string, text: string) => {
  try {
    const response = await env.EMAIL.send({
      to,
      from: `info@lifegate.bible`,
      subject,
      html,
      text,
    })
    return { success: true, messageId: response.messageId }
  }
  catch (err: any) {
    console.error('Email send failed:', err)
    return { success: false, error: err.message }
  }
}

// Names and funds reach these from a form, so they are escaped on the way into
// the HTML part. The plain-text part carries them verbatim, which is safe.
export const giftEmailTemplate = (firstName: string, amount: number, fund: string) => {
  const html = `
    <h2>Gift Received</h2>
    <p>Thank you for your generous gift of <strong>$${amount.toFixed(2)}</strong> to our ${escapeHtml(fund)} fund.</p>
    <p>Your contribution will make a meaningful difference in our ministry.</p>
    <p>You will receive a formal tax receipt via mail shortly.</p>
  `
  const text = `Gift Received\n\nThank you for your generous gift of $${amount.toFixed(2)} to our ${fund} fund.\n\nYour contribution will make a meaningful difference in our ministry.\n\nYou will receive a formal tax receipt via mail shortly.`
  return { html, text }
}

export const adminGiftNotificationTemplate = (firstName: string, lastName: string, amount: number, fund: string, email: string) => {
  const html = `
    <h2>New Gift Received</h2>
    <p><strong>Donor:</strong> ${escapeHtml(firstName)} ${escapeHtml(lastName)}</p>
    <p><strong>Amount:</strong> $${amount.toFixed(2)}</p>
    <p><strong>Fund:</strong> ${escapeHtml(fund)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
  `
  const text = `New Gift Received\n\nDonor: ${firstName} ${lastName}\nAmount: $${amount.toFixed(2)}\nFund: ${fund}\nEmail: ${email}`
  return { html, text }
}
