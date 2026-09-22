// Outbound mail. One function, two transports chosen by MAIL_TRANSPORT:
//   smtp       -> Nodemailer over SMTP. In development this is MailPit on the
//                 ZimaOS box, which captures mail instead of delivering it.
//   cloudflare -> Cloudflare Email Service's REST API. Production only; needs
//                 CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_EMAIL_API_TOKEN, and the
//                 sending domain onboarded to Email Sending.
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

export interface MailAttachment {
  filename: string
  content: Buffer
  contentType: string
}

export interface MailMessage {
  to: string
  subject: string
  text: string
  html: string
  attachments?: MailAttachment[]
}

const DEFAULT_FROM = 'Lifegate Baptist Church <no-reply@lifegate.bible>'
// Exported so the fallback can be tested: the ZimaOS production app
// definition deliberately leaves MAIL_FROM unset, because its install form
// rejects the angle brackets an RFC 5322 display name needs. That makes
// DEFAULT_FROM the real sender in production, not just a convenience.
export const mailFrom = () => process.env.MAIL_FROM || DEFAULT_FROM

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

// "Name <address>" or a bare address -> the REST API's { address, name }.
export const parseFrom = (from: string) => {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from)
  return match ? { address: match[2]!.trim(), name: match[1]!.trim() || undefined } : { address: from.trim() }
}

// The request body for Cloudflare's send endpoint. Note the REST API's own
// field names: `from.address`, and base64 `content` with `type`.
export const cloudflarePayload = (message: MailMessage, from: string) => ({
  to: message.to,
  from: parseFrom(from),
  subject: message.subject,
  html: message.html,
  text: message.text,
  ...(message.attachments?.length
    ? {
        attachments: message.attachments.map(attachment => ({
          content: attachment.content.toString('base64'),
          filename: attachment.filename,
          type: attachment.contentType,
          disposition: 'attachment',
        })),
      }
    : {}),
})

const sendViaCloudflare = async (message: MailMessage) => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const token = process.env.CLOUDFLARE_EMAIL_API_TOKEN
  if (!accountId || !token) throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_EMAIL_API_TOKEN must be set for MAIL_TRANSPORT=cloudflare.')

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/email/sending/send`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cloudflarePayload(message, mailFrom())),
  })
  if (response.status === 429) throw new Error('Cloudflare Email is rate limiting; try again in a few minutes.')
  const body = await response.json().catch(() => null) as {
    success?: boolean
    errors?: Array<{ message?: string }>
    result?: { permanent_bounces?: string[] }
  } | null
  if (!response.ok || !body?.success) {
    const detail = body?.errors?.map(e => e.message).filter(Boolean).join('; ')
    throw new Error(`Cloudflare Email refused the message (${response.status})${detail ? `: ${detail}` : ''}`)
  }
  if (body.result?.permanent_bounces?.length) throw new Error('The address bounced.')
}

// Which of the four deployments this is: dev, preview, staging, production.
//
// Deliberately NOT NODE_ENV. Staging and preview are built the same way as
// production and run with NODE_ENV=production, so NODE_ENV only separates a
// developer's machine from everything deployed -- it would have let staging
// send real mail to real members.
//
// Unset means refuse. A deployment that forgets to declare itself fails loudly
// with nothing delivered, which is the cheap mistake; the expensive one is a
// test instance quietly emailing the congregation.
export const appEnv = () => process.env.APP_ENV || ''

export const sendMail = async (message: MailMessage) => {
  const transport = process.env.MAIL_TRANSPORT || 'smtp'

  if (transport === 'cloudflare') {
    // Guard against real members receiving mail from any instance but the real one.
    if (appEnv() !== 'production') {
      throw new Error(
        `MAIL_TRANSPORT=cloudflare is refused outside production (APP_ENV=${appEnv() || 'unset'}).`,
      )
    }
    await sendViaCloudflare(message)
    return
  }

  await getSmtp().sendMail({
    from: mailFrom(),
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

export const escapeHtml = (value: string) =>
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

// A short note carrying a statement PDF.
export const renderStatementEmail = (opts: { churchName: string, statementName: string, year: number, closingMessage: string | null }) => {
  const intro = `Attached is your ${opts.year} contribution statement from ${opts.churchName}. Thank you for your faithful giving.`
  const html = `<!doctype html>
<html><body style="margin:0;background:#faf8f2;font-family:Georgia,serif;color:#262019">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <p style="font:700 11px/1 Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#1a5c30">${escapeHtml(opts.churchName)}</p>
    <h1 style="font-size:24px;margin:12px 0 16px">${opts.year} contribution statement</h1>
    <p style="font:16px/1.6 Arial,sans-serif">Dear ${escapeHtml(opts.statementName)},</p>
    <p style="font:16px/1.6 Arial,sans-serif">${escapeHtml(intro)}</p>
    ${opts.closingMessage ? `<p style="font:16px/1.6 Arial,sans-serif">${escapeHtml(opts.closingMessage)}</p>` : ''}
    <p style="font:13px/1.6 Arial,sans-serif;color:#75634a">Please keep the attached statement for your tax records.</p>
  </div>
</body></html>`
  const text = `Dear ${opts.statementName},\n\n${intro}\n\n${opts.closingMessage ? `${opts.closingMessage}\n\n` : ''}Please keep the attached statement for your tax records.\n`
  return { html, text }
}
