// "Sun, Oct 25" and "9:30 AM" from a due date and time. A due date is a plain
// calendar day, so it is read as one: new Date('2026-10-25') would be midnight
// UTC and show as the 24th west of Greenwich.
export const formatDue = (dueDate: string | null, dueTime: string | null) => {
  if (!dueDate) return ''
  const [year, month, day] = dueDate.split('-').map(Number) as [number, number, number]
  const date = new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (!dueTime) return date
  const [hours, minutes] = dueTime.split(':').map(Number) as [number, number]
  const time = new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${date}, ${time}`
}
