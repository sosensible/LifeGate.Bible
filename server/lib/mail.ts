// Outbound mail. One function, two transports chosen by MAIL_TRANSPORT:
//   smtp       -> Nodemailer over SMTP. In development this is MailPit on the
//                 ZimaOS box, which captures mail instead of delivering it.
//   cloudflare -> Cloudflare Email Service. Production only.
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

export interface MailMessage {
  to: string
  subject: string
  text: string
  html: string
}

let smtp: Transporter | undefined

const getSmtp = () => {
  smtp ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: Number(process.env.SMTP_PORT || 1025),
    // MailPit accepts unauthenticated, unencrypted SMTP on 1025.
    secure: false,
  })
  return smtp
}

export const sendMail = async (message: MailMessage) => {
  const transport = process.env.MAIL_TRANSPORT || 'smtp'

  if (transport === 'cloudflare') {
    // Guard against real members receiving mail from a dev or test instance.
    if (process.env.NODE_ENV !== 'production') {
      throw new Error('MAIL_TRANSPORT=cloudflare is refused outside production.')
    }
    throw new Error('Cloudflare Email transport is not implemented yet.')
  }

  await getSmtp().sendMail({
    from: process.env.MAIL_FROM || 'Lifegate Baptist Church <no-reply@lifegate.bible>',
    ...message,
  })
}

// Fire-and-forget for auth emails, so response timing cannot reveal whether an
// account exists. Failures are logged loudly instead of disappearing: an
// early-startup send once failed silently while the endpoint still said 200.
export const sendMailInBackground = (message: MailMessage) => {
  sendMail(message).catch((error: unknown) => {
    console.error(
      `[mail] FAILED to send "${message.subject}" via ${process.env.MAIL_TRANSPORT || 'smtp'} `
      + `(${process.env.SMTP_HOST || 'localhost'}:${process.env.SMTP_PORT || 1025}):`,
      error,
    )
  })
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Minimal branded wrapper so every auth email looks the same.
export const renderActionEmail = (opts: {
  heading: string
  intro: string
  actionLabel: string
  actionUrl: string
  footnote: string
}) => {
  const url = escapeHtml(opts.actionUrl)
  const html = `<!doctype html>
<html><body style="margin:0;background:#faf8f2;font-family:Georgia,serif;color:#262019">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <p style="font:700 11px/1 Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#1a5c30">Lifegate Baptist Church</p>
    <h1 style="font-size:26px;margin:12px 0 16px">${escapeHtml(opts.heading)}</h1>
    <p style="font:16px/1.6 Arial,sans-serif">${escapeHtml(opts.intro)}</p>
    <p style="margin:28px 0"><a href="${url}" style="background:#1a5c30;color:#fff;text-decoration:none;font:700 14px Arial,sans-serif;padding:12px 22px;border-radius:4px;display:inline-block">${escapeHtml(opts.actionLabel)}</a></p>
    <p style="font:13px/1.6 Arial,sans-serif;color:#75634a">${escapeHtml(opts.footnote)}</p>
  </div>
</body></html>`
  const text = `${opts.heading}\n\n${opts.intro}\n\n${opts.actionLabel}: ${opts.actionUrl}\n\n${opts.footnote}\n`
  return { html, text }
}
