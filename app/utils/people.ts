// Display helpers for people in the directory, rosters and admin.

export const fullName = (person: { firstName: string, lastName: string }) =>
  `${person.firstName} ${person.lastName}`

export const initialsOf = (person: { firstName: string, lastName: string }) =>
  `${person.firstName.charAt(0)}${person.lastName.charAt(0)}`.toUpperCase()

// The church palette. The same person always gets the same color.
const AVATAR_COLORS = ['#7B1828', '#1A5C30', '#7A5828', '#256035', '#5D1220', '#3A4E24', '#4A3224', '#2A3C6C']

export const avatarColor = (id: string) => {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

// "09-03" -> "September 3". Accepts a full YYYY-MM-DD too, ignoring the year.
export const formatBirthday = (value: string) => {
  const [month, day] = value.slice(-5).split('-').map(Number)
  return new Date(2000, month! - 1, day).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}
