// The public contact form.
//
// This was v1 marketing-site code that read `event.context.cloudflare.env.db`
// and an `EMAIL` binding. Neither exists on the node-server preset this site
// actually runs on, so every submission returned 500 and the visitor's message
// was lost. It now uses the app's own mail layer.
//
// Nothing is stored. The office reads these in a mailbox, and a table nobody
// has a screen for is a place messages go to be forgotten -- so the send is
// awaited and a failure is reported honestly, rather than telling somebody
// their message arrived when it did not.
//
// The visitor is not sent a confirmation. Mailing whatever address a form is
// given lets a stranger point the church's mail at someone else, repeatedly;
// the page promises only that we will be in touch.
import { contactSchema } from '../../../shared/contact.ts'
import { contactEmail } from '../../lib/contact.ts'
import { sendMail } from '../../lib/mail.ts'
import { officeEmail } from '../../lib/site.ts'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, contactSchema.parse)
  const { subject, html, text } = contactEmail(input)

  // The office's address from /admin/site, else CONTACT_EMAIL. With neither, say so
  // rather than sending visitors' messages to nobody, or to a stranger.
  const office = officeEmail()
  if (!office) {
    console.error('[contact] No contact email is set. Set one on /admin/site, or CONTACT_EMAIL on the server.')
    throw createError({ statusCode: 503, statusMessage: 'The contact form is not set up yet. Please telephone the church office.' })
  }

  try {
    // Awaited: if this fails the visitor needs to know, because there is no
    // copy anywhere else.
    await sendMail({ to: office, subject, text, html })
  }
  catch (error) {
    console.error('[contact] Could not deliver a message from the website:', error)
    throw createError({
      statusCode: 502,
      statusMessage: 'We could not send your message. Please try again, or telephone the church office.',
    })
  }

  return { success: true, message: 'Message sent successfully' }
})
