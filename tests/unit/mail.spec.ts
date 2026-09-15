import { describe, expect, it } from 'vitest'
import { cloudflarePayload, parseFrom } from '../../server/lib/mail'

describe('Cloudflare Email payload', () => {
  it('uses the REST API’s field names and base64 attachments', () => {
    const payload = cloudflarePayload({
      to: 'giver@example.org',
      subject: '2027 contribution statement',
      text: 'Attached',
      html: '<p>Attached</p>',
      attachments: [{ filename: 'statement.pdf', content: Buffer.from('%PDF-1.7'), contentType: 'application/pdf' }],
    }, 'Lifegate Baptist Church <no-reply@lifegate.bible>')

    expect(payload).toEqual({
      to: 'giver@example.org',
      from: { address: 'no-reply@lifegate.bible', name: 'Lifegate Baptist Church' },
      subject: '2027 contribution statement',
      html: '<p>Attached</p>',
      text: 'Attached',
      attachments: [{ content: Buffer.from('%PDF-1.7').toString('base64'), filename: 'statement.pdf', type: 'application/pdf', disposition: 'attachment' }],
    })
  })

  it('leaves attachments out when there are none, and accepts a bare address', () => {
    expect(cloudflarePayload({ to: 'a@example.org', subject: 's', text: 't', html: 'h' }, 'x@lifegate.bible')).not.toHaveProperty('attachments')
    expect(parseFrom('x@lifegate.bible')).toEqual({ address: 'x@lifegate.bible' })
  })
})
