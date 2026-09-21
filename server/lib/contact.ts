// Turning a contact-form submission into the message the office receives.
//
// Kept out of the route so the escaping can be tested: every field here was
// typed by a stranger, and the HTML part goes into somebody's mail client.
import type { ContactSubmission } from '../../shared/contact.ts'
import { escapeHtml } from './mail.ts'

export const contactEmail = (input: ContactSubmission) => {
  const rows: Array<[string, string]> = [
    ['From', input.name],
    ['Email', input.email],
    ...(input.phone ? [['Phone', input.phone] as [string, string]] : []),
    ['Subject', input.subject],
  ]

  const html = [
    '<h2>Message from the website</h2>',
    ...rows.map(([label, value]) => `<p><strong>${label}:</strong> ${escapeHtml(value)}</p>`),
    '<p><strong>Message:</strong></p>',
    // Escaped first, so the only markup that survives is the line breaks we add.
    `<p>${escapeHtml(input.message).replace(/\n/g, '<br>')}</p>`,
  ].join('\n')

  const text = [
    'Message from the website',
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    'Message:',
    input.message,
  ].join('\n')

  return { subject: `Contact form: ${input.subject}`, html, text }
}
