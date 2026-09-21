import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloudflarePayload, parseFrom, sendMail } from '../../server/lib/mail'

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

// The church has four deployments and only one of them may reach a real
// mailbox. This guard used to read NODE_ENV, which is `production` on staging
// and preview too -- it separated a developer's laptop from everything
// deployed, not the real site from the rehearsals.
describe('which deployment may send real mail', () => {
  const message = { to: 'member@example.org', subject: 's', text: 't', html: 'h' }

  const asDeployment = (appEnv: string | undefined) => {
    vi.stubEnv('MAIL_TRANSPORT', 'cloudflare')
    vi.stubEnv('NODE_ENV', 'production') // true of staging and preview as well
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acct')
    vi.stubEnv('CLOUDFLARE_EMAIL_API_TOKEN', 'token')
    if (appEnv === undefined) vi.stubEnv('APP_ENV', '')
    else vi.stubEnv('APP_ENV', appEnv)
  }

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it.each(['staging', 'preview', 'dev'])('refuses to send from %s', async (env) => {
    asDeployment(env)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(sendMail(message)).rejects.toThrow(/refused outside production/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses when the deployment does not say what it is', async () => {
    // Forgetting to set APP_ENV must fail closed. Nothing delivered is the
    // cheap mistake; a rehearsal emailing the congregation is not.
    asDeployment(undefined)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(sendMail(message)).rejects.toThrow(/APP_ENV=unset/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends from production', async () => {
    asDeployment('production')
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    await expect(sendMail(message)).resolves.toBeUndefined()
    expect(fetchSpy).toHaveBeenCalledOnce()
  })
})
