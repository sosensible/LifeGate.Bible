// A guest enters the code made for them. The first browser to use a code is remembered by a cookie;
// any other browser is turned away. A few wrong tries in a row from one place make it wait.
import { z } from 'zod'
import { forgetWrongCodes, guestPlace, loadBroadcastBySlug, newDeviceSecret, noteWrongCode, redeemCode, tooManyWrongCodes, watchState } from '../../../../lib/broadcasts.ts'

const REASONS = {
  invalid: 'That code was not recognised. Check it and try again.',
  revoked: 'That code has been turned off.',
  'in-use': 'That code is already being used on another device. Ask for a new one.',
} as const

export default defineEventHandler(async (event) => {
  const broadcast = loadBroadcastBySlug(getRouterParam(event, 'slug') ?? '')
  if (!broadcast || broadcast.audience !== 'members_and_guests') throw createError({ statusCode: 404, statusMessage: 'Broadcast not found' })
  const { code } = await readValidatedBody(event, z.object({ code: z.string().trim().min(1).max(40) }).parse)

  const place = guestPlace(broadcast.id, getRequestHeader(event, 'cf-connecting-ip'), getRequestIP(event))
  if (tooManyWrongCodes(place)) throw createError({ statusCode: 429, statusMessage: 'Too many wrong codes. Please wait ten minutes and try again.' })

  const secret = newDeviceSecret()
  const result = redeemCode(broadcast, code, secret)
  if (!result.ok) {
    noteWrongCode(place)
    throw createError({ statusCode: result.reason === 'invalid' ? 400 : 403, statusMessage: REASONS[result.reason] })
  }
  forgetWrongCodes(place)

  setCookie(event, watchCookieName(broadcast), `${result.passId}.${secret}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: getRequestProtocol(event, { xForwardedProto: true }) === 'https',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  setHeader(event, 'cache-control', 'no-store')
  return watchState(broadcast, { kind: 'pass', passId: result.passId })
})
