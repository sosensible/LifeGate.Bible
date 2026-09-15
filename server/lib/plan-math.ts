// What a category's plan needs in a month. Pure: no database, so every rule is
// unit-tested directly (tests/unit/plans.spec.ts).
//
// Monthly plans
//   Fill up to X: X − (Remaining carried in) − (funded this month)
//   Add X:        X − (funded this month)
//
// Dated plans work in cycles ending at a due month.
//   By the date:  the due month counts as a month to fund in.
//   By the month: the money must be in before the due month starts; in the
//                 due month itself a shortfall is late.
//   Shortfall:    Fill up to X: X − Remaining carried in
//                 Add X:        X − funded since the cycle began (before this month)
//   Needed:       shortfall ÷ months left (rounded up to the cent, so the last
//                 month takes the leftover), less what is funded this month.
//   Repeating plans start the next cycle the month after the due month and ask
//   again, dividing by the months left to the next due month. A plan that does
//   not repeat is done once its due month has passed.
import { addMonths, monthEnd, type PlanStatus, type PlanView } from '../../shared/stewardship.ts'
import { addMonthsToDate, monthsBetween, nextOccurrence, occurrencesBetween, type Schedule } from './schedule.ts'

const REPEAT_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 } as const

export interface PlanMonth {
  month: string
  // Remaining carried into the month (0 for categories that reset).
  startRemainingCents: number
  // Remaining at the end of the month.
  remainingCents: number
  // Funded for this category in a given month.
  funded: (month: string) => number
}

// Recurring bills that feed the plan, with amounts as positive cents to cover.
export interface PlanBill extends Schedule {
  amountCents: number
}

const ceilDiv = (amount: number, months: number) => (amount <= 0 ? 0 : Math.ceil(amount / months))

// The cycle a month falls in: its due month and date, and the month it began.
export const cycleFor = (plan: Pick<PlanView, 'dueOn' | 'repeat' | 'startMonth'>, month: string) => {
  const firstDueOn = plan.dueOn!
  const firstDue = firstDueOn.slice(0, 7)
  if (plan.repeat === 'none' || month <= firstDue) {
    return { dueMonth: firstDue, dueOn: firstDueOn, cycleStart: plan.startMonth }
  }
  const step = REPEAT_MONTHS[plan.repeat]
  const cycles = Math.ceil(monthsBetween(firstDue, month) / step)
  const dueMonth = addMonths(firstDue, cycles * step)
  return { dueMonth, dueOn: addMonthsToDate(firstDueOn, cycles * step), cycleStart: addMonths(dueMonth, 1 - step) }
}

const fundedBetween = (ctx: PlanMonth, from: string, through: string) => {
  let total = 0
  for (let m = from; m <= through; m = addMonths(m, 1)) total += ctx.funded(m)
  return total
}

const withStatus = (ctx: PlanMonth, result: Omit<PlanStatus, 'status'> & { late?: boolean }): PlanStatus => {
  const { late, ...rest } = result
  const status = ctx.remainingCents < 0
    ? 'overspent'
    : late ? 'late' : rest.neededCents > 0 ? 'underfunded' : 'onTrack'
  return { status, ...rest }
}

export const planNeed = (plan: PlanView, ctx: PlanMonth, bills: PlanBill[] = []): PlanStatus => {
  if (ctx.month < plan.startMonth) {
    return { status: 'notStarted', neededCents: 0, targetCents: plan.amountCents, dueOn: plan.dueOn, deadline: plan.cadence === 'byDate' ? plan.deadline : null }
  }
  if (plan.source === 'recurring') return recurringNeed(plan, ctx, bills)

  const target = plan.amountCents
  const fundedNow = ctx.funded(ctx.month)

  if (plan.cadence === 'monthly') {
    const base = plan.kind === 'fillUpTo' ? ctx.startRemainingCents + fundedNow : fundedNow
    return withStatus(ctx, { neededCents: Math.max(0, target - base), targetCents: target, dueOn: null, deadline: null })
  }

  const cycle = cycleFor(plan, ctx.month)
  if (ctx.month > cycle.dueMonth) {
    // A plan that does not repeat is finished once its due month has passed.
    return withStatus(ctx, { neededCents: 0, targetCents: target, dueOn: cycle.dueOn, deadline: plan.deadline })
  }

  const shortfall = plan.kind === 'fillUpTo'
    ? target - ctx.startRemainingCents
    : target - fundedBetween(ctx, cycle.cycleStart, addMonths(ctx.month, -1))
  const monthsLeft = monthsBetween(ctx.month, cycle.dueMonth) + (plan.deadline === 'byDate' ? 1 : 0)

  if (monthsLeft <= 0) {
    // By the month, in the due month: whatever is still short is late.
    const neededCents = Math.max(0, shortfall - fundedNow)
    return withStatus(ctx, { neededCents, targetCents: target, dueOn: cycle.dueOn, deadline: plan.deadline, late: neededCents > 0 })
  }

  return withStatus(ctx, {
    neededCents: Math.max(0, ceilDiv(shortfall, monthsLeft) - fundedNow),
    targetCents: target,
    dueOn: cycle.dueOn,
    deadline: plan.deadline,
  })
}

// Weekly, every-2-weeks and monthly bills need what falls due this month.
// Quarterly and yearly bills are set aside evenly by their due date (the due
// month counts), starting no earlier than the plan.
const recurringNeed = (plan: PlanView, ctx: PlanMonth, bills: PlanBill[]): PlanStatus => {
  const from = `${ctx.month}-01`
  const to = monthEnd(ctx.month)
  let total = 0
  let soonest: string | null = null

  for (const bill of bills) {
    if (bill.frequency === 'quarterly' || bill.frequency === 'yearly') {
      const due = nextOccurrence(bill, from)
      if (!due) continue
      const step = bill.frequency === 'quarterly' ? 3 : 12
      const dueMonth = due.slice(0, 7)
      const cycleStart = [addMonths(dueMonth, 1 - step), plan.startMonth].sort().at(-1)!
      total += ceilDiv(bill.amountCents, monthsBetween(cycleStart, dueMonth) + 1)
      if (!soonest || due < soonest) soonest = due
      continue
    }
    const dates = occurrencesBetween(bill, from, to)
    total += dates.length * bill.amountCents
    if (dates[0] && (!soonest || dates[0] < soonest)) soonest = dates[0]
  }

  return withStatus(ctx, {
    neededCents: Math.max(0, total - ctx.funded(ctx.month)),
    targetCents: total,
    dueOn: soonest,
    deadline: null,
  })
}
