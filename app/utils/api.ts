// The message a server route gave with createError, or a fallback.
export const apiErrorMessage = (error: unknown, fallback = 'Something went wrong. Please try again.') => {
  const err = error as { data?: { statusMessage?: string, message?: string }, statusMessage?: string } | null
  return err?.data?.statusMessage || err?.statusMessage || fallback
}
