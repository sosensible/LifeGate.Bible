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

export const contactEmailTemplate = (name: string, email: string, subject: string, message: string) => {
  const html = `
    <h2>New Contact Form Submission</h2>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Subject:</strong> ${subject}</p>
    <p><strong>Message:</strong></p>
    <p>${message.replace(/\n/g, '<br>')}</p>
  `
  const text = `New Contact Form Submission\n\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\n\nMessage:\n${message}`
  return { html, text }
}

export const giftEmailTemplate = (firstName: string, amount: number, fund: string) => {
  const html = `
    <h2>Gift Received</h2>
    <p>Thank you for your generous gift of <strong>$${amount.toFixed(2)}</strong> to our ${fund} fund.</p>
    <p>Your contribution will make a meaningful difference in our ministry.</p>
    <p>You will receive a formal tax receipt via mail shortly.</p>
  `
  const text = `Gift Received\n\nThank you for your generous gift of $${amount.toFixed(2)} to our ${fund} fund.\n\nYour contribution will make a meaningful difference in our ministry.\n\nYou will receive a formal tax receipt via mail shortly.`
  return { html, text }
}

export const adminGiftNotificationTemplate = (firstName: string, lastName: string, amount: number, fund: string, email: string) => {
  const html = `
    <h2>New Gift Received</h2>
    <p><strong>Donor:</strong> ${firstName} ${lastName}</p>
    <p><strong>Amount:</strong> $${amount.toFixed(2)}</strong></p>
    <p><strong>Fund:</strong> ${fund}</p>
    <p><strong>Email:</strong> ${email}</p>
  `
  const text = `New Gift Received\n\nDonor: ${firstName} ${lastName}\nAmount: $${amount.toFixed(2)}\nFund: ${fund}\nEmail: ${email}`
  return { html, text }
}
