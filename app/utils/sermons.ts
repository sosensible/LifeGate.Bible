// "2025-06-22" -> "June 22, 2025". Built from parts so no timezone can shift the day.
export const formatSermonDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year!, month! - 1, day).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export const sermonThumbnailUrl = (slug: string) => `/api/sermons/${encodeURIComponent(slug)}/thumbnail`

// A steady placeholder color for sermons without a video, from the church palette.
export const sermonColor = (id: string) => avatarColor(id)
