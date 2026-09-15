// SimpleFIN Bridge protocol: claiming a setup token and reading accounts.
//
// No database here, so the claim script can use it on its own. The access URL
// (with its credentials) is a secret kept in SIMPLEFIN_ACCESS_URL, never in
// the database. Protocol: https://www.simplefin.org/protocol.html
export const DAY = 24 * 60 * 60 * 1000
export const MAX_WINDOW_DAYS = 90
// Re-read a week before the last good sync: banks post late and fix entries.
export const OVERLAP_DAYS = 7
export const MIN_MANUAL_INTERVAL_MS = 30 * 60 * 1000

// Dates are the church's calendar dates, not the server's.
const TIME_ZONE = process.env.CHURCH_TIME_ZONE || 'America/Detroit'

export interface SimplefinTransaction {
  id: string
  posted: number
  amount: string
  description: string
  payee?: string
  memo?: string
  pending?: boolean
}

export interface SimplefinAccount {
  id: string
  name: string
  conn_id?: string
  currency: string
  balance: string
  'balance-date': number
  org?: { name?: string }
  transactions?: SimplefinTransaction[]
}

export interface SimplefinAccountSet {
  errlist?: Array<{ code?: string, msg?: string }>
  errors?: string[] // protocol v1
  connections?: Array<{ conn_id: string, name?: string }>
  accounts: SimplefinAccount[]
}

type Fetch = typeof fetch

// fetch() refuses URLs with credentials in them, so move them to a header.
export const parseAccessUrl = (accessUrl: string) => {
  let url: URL
  try {
    url = new URL(accessUrl)
  }
  catch {
    throw new Error('SIMPLEFIN_ACCESS_URL is not a valid URL')
  }
  const credentials = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`
  url.username = ''
  url.password = ''
  return {
    baseUrl: url.toString().replace(/\/$/, ''),
    authorization: `Basic ${Buffer.from(credentials).toString('base64')}`,
  }
}

// A setup token is a base64 claim URL that works once and returns the access URL.
export const claimSetupToken = async (setupToken: string, fetchImpl: Fetch = fetch) => {
  const claimUrl = Buffer.from(setupToken.trim(), 'base64').toString('utf8')
  if (!/^https:\/\//.test(claimUrl)) throw new Error('That does not look like a SimpleFIN setup token')
  const response = await fetchImpl(claimUrl, { method: 'POST', headers: { 'Content-Length': '0' } })
  if (!response.ok) throw new Error(`SimpleFIN refused the token (${response.status}); a token can be claimed only once`)
  return (await response.text()).trim()
}

export const fetchAccountSet = async (accessUrl: string, startDate: Date, fetchImpl: Fetch = fetch): Promise<SimplefinAccountSet> => {
  const { baseUrl, authorization } = parseAccessUrl(accessUrl)
  const query = new URLSearchParams({ 'version': '2', 'start-date': String(Math.floor(startDate.getTime() / 1000)) })
  const response = await fetchImpl(`${baseUrl}/accounts?${query}`, { headers: { Authorization: authorization } })
  if (response.status === 403) throw new Error('SimpleFIN rejected the access URL; it may have been revoked')
  if (!response.ok) throw new Error(`SimpleFIN returned ${response.status}`)
  return await response.json() as SimplefinAccountSet
}

// From the earlier of (last good sync − a week) and 90 days ago, whichever is later.
export const syncWindowStart = (lastSuccessAt: Date | null, now: Date) => {
  const earliest = now.getTime() - MAX_WINDOW_DAYS * DAY
  if (!lastSuccessAt) return new Date(earliest)
  return new Date(Math.max(earliest, lastSuccessAt.getTime() - OVERLAP_DAYS * DAY))
}

export const epochToDate = (seconds: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(seconds * 1000))

