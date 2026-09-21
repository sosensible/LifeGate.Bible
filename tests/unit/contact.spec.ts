// The public contact form.
//
// It spent its whole life returning 500 -- it read a Cloudflare binding that
// does not exist on the server this site runs on -- so every message a visitor
// sent was lost. These tests cover what it accepts and what the office ends up
// reading.
import { describe, expect, it } from 'vitest'
import { contactSchema } from '../../shared/contact'
import { contactEmail } from '../../server/lib/contact'

const valid = {
  name: 'Ada Carter',
  email: 'ada@example.org',
  subject: 'Service times',
  message: 'What time does the Sunday service start?',
}

describe('what the form accepts', () => {
  it('takes a complete message', () => {
    expect(contactSchema.parse(valid)).toMatchObject(valid)
  })

  it.each(['name', 'email', 'subject', 'message'])('refuses a message with no %s', (field) => {
    expect(() => contactSchema.parse({ ...valid, [field]: '' })).toThrow()
  })

  it.each(['name', 'email', 'subject', 'message'])('refuses a message missing %s entirely', (field) => {
    const { [field as keyof typeof valid]: _dropped, ...rest } = valid
    expect(() => contactSchema.parse(rest)).toThrow()
  })

  it('refuses an address that is not one', () => {
    expect(() => contactSchema.parse({ ...valid, email: 'not-an-address' })).toThrow()
  })

  it('treats the phone number as optional and takes it however it is written', () => {
    expect(contactSchema.parse({ ...valid, phone: '(269) 555-0134 ext. 2' }).phone).toBe('(269) 555-0134 ext. 2')
    expect(contactSchema.parse(valid).phone).toBeUndefined()
  })

  it('refuses a message long enough to be an attack rather than a question', () => {
    expect(() => contactSchema.parse({ ...valid, message: 'x'.repeat(5001) })).toThrow()
  })
})

describe('the message the office receives', () => {
  it('carries the name, address and message', () => {
    const mail = contactEmail(contactSchema.parse(valid))
    expect(mail.subject).toBe('Contact form: Service times')
    expect(mail.text).toContain('Ada Carter')
    expect(mail.text).toContain('ada@example.org')
    expect(mail.text).toContain('What time does the Sunday service start?')
  })

  it('names the phone number only when one was given', () => {
    expect(contactEmail(contactSchema.parse(valid)).html).not.toContain('Phone')
    expect(contactEmail(contactSchema.parse({ ...valid, phone: '269-555-0134' })).html).toContain('269-555-0134')
  })

  it('escapes markup a stranger typed instead of rendering it', () => {
    // Whoever opens this is reading it in a mail client. The old templates
    // interpolated these straight into the HTML.
    const mail = contactEmail(contactSchema.parse({
      ...valid,
      name: '<script>alert(1)</script>',
      subject: 'Hello <img src=x onerror=alert(1)>',
      message: 'Link: <a href="http://example.com/bad">click</a>',
    }))

    expect(mail.html).not.toContain('<script>')
    expect(mail.html).not.toContain('<img')
    expect(mail.html).not.toContain('<a href')
    expect(mail.html).toContain('&lt;script&gt;')
  })

  it('keeps the subject line readable even when it contains markup', () => {
    // The subject is a mail header, not HTML -- escaping it would show the
    // office `&lt;` instead of `<`.
    const mail = contactEmail(contactSchema.parse({ ...valid, subject: 'a < b' }))
    expect(mail.subject).toBe('Contact form: a < b')
  })

  it('turns the line breaks somebody typed into breaks, and nothing else', () => {
    const mail = contactEmail(contactSchema.parse({ ...valid, message: 'first\nsecond' }))
    expect(mail.html).toContain('first<br>second')
  })
})
