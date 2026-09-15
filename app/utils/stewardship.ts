// Helpers shared by the Stewardship pages.
import { formatCents } from '#shared/money'
import { addMonths, currentMonth, monthLabel, PLAN_REPEAT_LABELS, type CategoryGroupView, type PlanStatusName, type PlanView, type UpcomingOccurrence } from '#shared/stewardship'

export interface CategoryMenuItem {
  type?: 'label'
  label: string
  value?: string
}

// Category choices for USelectMenu, grouped under their group names.
// Available to Fund comes first, labelled as income; archived categories are left out.
export const categoryMenuItems = (groups: CategoryGroupView[], options: { uncategorized?: boolean } = {}): CategoryMenuItem[][] => {
  const all = groups.flatMap(g => g.categories)
  const income = all.find(c => c.kind === 'availableToFund')
  return [
    [
      ...(options.uncategorized ? [{ label: 'Uncategorized', value: 'uncategorized' }] : []),
      ...(income ? [{ label: 'Available to Fund (income)', value: income.id }] : []),
    ],
    ...groups
      .filter(g => !g.archivedAt)
      .map(g => [
        { type: 'label' as const, label: g.name },
        ...g.categories.filter(c => c.kind === 'spending' && !c.archivedAt).map(c => ({ label: c.name, value: c.id })),
      ])
      .filter(items => items.length > 1),
  ].filter(items => items.length > 0)
}

// Recent months for filters, newest first: [{ label: 'September 2026', value: '2026-09' }, ...]
export const recentMonthItems = (count = 24) => {
  const now = currentMonth()
  return Array.from({ length: count }, (_, i) => {
    const value = addMonths(now, -i)
    return { label: monthLabel(value), value }
  })
}

// Plans ------------------------------------------------------------------------

const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

// "Fill up to $1,200.00 by Jun 15, 2027 (by the month), yearly"
export const describePlan = (plan: PlanView) => {
  if (plan.source === 'recurring') return 'From this category’s recurring bills'
  const verb = plan.kind === 'fillUpTo' ? 'Fill up to' : 'Add'
  const amount = formatCents(plan.amountCents)
  if (plan.cadence === 'monthly') return `${verb} ${amount} each month`
  const when = plan.deadline === 'byMonth' ? 'before the month starts' : 'by the date'
  const repeat = plan.repeat === 'none' ? '' : `, ${PLAN_REPEAT_LABELS[plan.repeat].toLowerCase()}`
  return `${verb} ${amount} by ${dateLabel(plan.dueOn!)} (${when})${repeat}`
}

export const PLAN_STATUS_BADGES: Record<PlanStatusName, { label: string, color: 'neutral' | 'success' | 'warning' | 'error' | 'info' }> = {
  notStarted: { label: 'Not started', color: 'neutral' },
  onTrack: { label: 'On track', color: 'success' },
  underfunded: { label: 'Needs funding', color: 'warning' },
  late: { label: 'Late', color: 'error' },
  overspent: { label: 'Overspent', color: 'error' },
}

export const formatDueDate = dateLabel

// Recurring ----------------------------------------------------------------------

export const OCCURRENCE_BADGES: Record<UpcomingOccurrence['status'], { label: string, color: 'neutral' | 'success' | 'warning' | 'error' | 'info' }> = {
  open: { label: 'Upcoming', color: 'info' },
  overdue: { label: 'Not yet seen', color: 'warning' },
  paid: { label: 'Paid', color: 'success' },
  entered: { label: 'Entered', color: 'success' },
  skipped: { label: 'Skipped', color: 'neutral' },
}
