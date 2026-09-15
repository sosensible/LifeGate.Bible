// Plan math and recurring schedules: pure functions, no database.
import { describe, expect, it } from 'vitest'
import { addMonths, type PlanView } from '../../shared/stewardship'
import { planNeed, type PlanMonth } from '../../server/lib/plan-math'
import { addMonthsToDate, nextOccurrence, occurrencesBetween } from '../../server/lib/schedule'

// Simulates funding exactly what the plan asks each month, with no spending,
// and returns what was asked for month by month.
const simulate = (plan: PlanView, from: string, through: string, options: { rollover?: boolean, spend?: Record<string, number> } = {}) => {
  const funded = new Map<string, number>()
  const asked: Record<string, number> = {}
  const statuses: Record<string, string> = {}
  let remaining = 0
  for (let month = from; month <= through; month = addMonths(month, 1)) {
    const start = options.rollover === false ? 0 : remaining
    const ctx = (fundedNow: number): PlanMonth => ({
      month,
      startRemainingCents: start,
      remainingCents: start + fundedNow - (options.spend?.[month] ?? 0),
      funded: m => (m === month ? fundedNow : funded.get(m) ?? 0),
    })
    const need = planNeed(plan, ctx(0))
    asked[month] = need.neededCents
    statuses[month] = need.status
    funded.set(month, need.neededCents)
    remaining = start + need.neededCents - (options.spend?.[month] ?? 0)
  }
  return { asked, statuses }
}

const plan = (overrides: Partial<PlanView>): PlanView => ({
  categoryId: 'c',
  source: 'custom',
  kind: 'fillUpTo',
  cadence: 'monthly',
  amountCents: 0,
  dueOn: null,
  deadline: 'byDate',
  repeat: 'none',
  startMonth: '2026-01',
  ...overrides,
})

describe('dated plans', () => {
  const insurance = { kind: 'fillUpTo', cadence: 'byDate', amountCents: 120_000, dueOn: '2026-06-15', repeat: 'yearly', startMonth: '2026-01' } as const

  it('by the month: fully funded before June starts ($240 × 5), late if short in June', () => {
    const { asked } = simulate(plan({ ...insurance, deadline: 'byMonth' }), '2026-01', '2026-06')
    expect(asked).toEqual({ '2026-01': 24_000, '2026-02': 24_000, '2026-03': 24_000, '2026-04': 24_000, '2026-05': 24_000, '2026-06': 0 })

    const lateJune = planNeed(plan({ ...insurance, deadline: 'byMonth' }), { month: '2026-06', startRemainingCents: 100_000, remainingCents: 100_000, funded: () => 0 })
    expect(lateJune).toMatchObject({ status: 'late', neededCents: 20_000 })
  })

  it('by the date: June counts ($200 × 6)', () => {
    const { asked } = simulate(plan({ ...insurance, deadline: 'byDate' }), '2026-01', '2026-06')
    expect(Object.values(asked)).toEqual([20_000, 20_000, 20_000, 20_000, 20_000, 20_000])
  })

  it('repeats yearly: after paying in June, July asks for the next June over 12 months ($100)', () => {
    const { asked } = simulate(plan({ ...insurance, deadline: 'byDate' }), '2026-01', '2026-08', { spend: { '2026-06': 120_000 } })
    expect(asked['2026-07']).toBe(10_000)
    expect(asked['2026-08']).toBe(10_000)
  })

  it('"add" counts funding since the cycle began, not the balance', () => {
    const { asked } = simulate(plan({ ...insurance, kind: 'add', deadline: 'byDate' }), '2026-01', '2026-03', { spend: { '2026-02': 50_000 } })
    // Spending does not make "add" ask for more.
    expect(Object.values(asked)).toEqual([20_000, 20_000, 20_000])
  })

  it('repeats quarterly', () => {
    const { asked } = simulate(plan({ kind: 'add', cadence: 'byDate', amountCents: 30_000, dueOn: '2026-03-10', repeat: 'quarterly', startMonth: '2026-01' }), '2026-01', '2026-06')
    expect(Object.values(asked)).toEqual([10_000, 10_000, 10_000, 10_000, 10_000, 10_000])
  })

  it('rounds up to the cent so the last month takes the leftover', () => {
    const { asked } = simulate(plan({ cadence: 'byDate', amountCents: 10_000, dueOn: '2026-03-01', startMonth: '2026-01' }), '2026-01', '2026-03')
    expect(Object.values(asked)).toEqual([3_334, 3_333, 3_333])
  })

  it('is finished after its due month when it does not repeat, and waits for its start month', () => {
    const done = planNeed(plan({ cadence: 'byDate', amountCents: 10_000, dueOn: '2026-03-01' }), { month: '2026-05', startRemainingCents: 0, remainingCents: 0, funded: () => 0 })
    expect(done).toMatchObject({ status: 'onTrack', neededCents: 0 })
    const early = planNeed(plan({ amountCents: 5_000, startMonth: '2026-04' }), { month: '2026-03', startRemainingCents: 0, remainingCents: 0, funded: () => 0 })
    expect(early.status).toBe('notStarted')
  })
})

describe('monthly plans', () => {
  it('fill up to counts what is already there; add does not', () => {
    const ctx: PlanMonth = { month: '2026-02', startRemainingCents: 3_000, remainingCents: 3_000, funded: () => 1_000 }
    expect(planNeed(plan({ kind: 'fillUpTo', amountCents: 10_000 }), ctx)).toMatchObject({ neededCents: 6_000, status: 'underfunded' })
    expect(planNeed(plan({ kind: 'add', amountCents: 10_000 }), ctx)).toMatchObject({ neededCents: 9_000 })
    expect(planNeed(plan({ kind: 'add', amountCents: 1_000 }), ctx)).toMatchObject({ neededCents: 0, status: 'onTrack' })
  })

  it('reports overspending', () => {
    const ctx: PlanMonth = { month: '2026-02', startRemainingCents: 0, remainingCents: -500, funded: () => 10_000 }
    expect(planNeed(plan({ kind: 'add', amountCents: 10_000 }), ctx).status).toBe('overspent')
  })
})

describe('plans from recurring bills', () => {
  const recurringPlan = plan({ source: 'recurring', startMonth: '2026-01' })
  const ctx = (month: string, funded = 0): PlanMonth => ({ month, startRemainingCents: 0, remainingCents: funded, funded: m => (m === month ? funded : 0) })

  it('needs this month’s monthly and weekly bills, and spreads yearly bills to their due month', () => {
    const bills = [
      { frequency: 'monthly', anchorOn: '2025-11-05', endOn: null, amountCents: 18_000 },
      { frequency: 'weekly', anchorOn: '2026-01-02', endOn: null, amountCents: 1_000 }, // 5 Fridays in January 2026
      { frequency: 'yearly', anchorOn: '2026-04-20', endOn: null, amountCents: 40_000 }, // Jan–Apr: $100 each
    ] as const
    expect(planNeed(recurringPlan, ctx('2026-01'), [...bills])).toMatchObject({ neededCents: 18_000 + 5_000 + 10_000, dueOn: '2026-01-02' })
    expect(planNeed(recurringPlan, ctx('2026-01', 20_000), [...bills]).neededCents).toBe(13_000)
  })
})

describe('schedules', () => {
  it('keeps the 31st where the month has one', () => {
    expect(occurrencesBetween({ frequency: 'monthly', anchorOn: '2026-01-31', endOn: null }, '2026-01-01', '2026-04-30'))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
    expect(addMonthsToDate('2028-01-31', 1)).toBe('2028-02-29')
  })

  it('steps weekly and every two weeks, and stops at the end date', () => {
    expect(occurrencesBetween({ frequency: 'every2Weeks', anchorOn: '2026-01-01', endOn: '2026-02-12' }, '2026-01-10', '2026-12-31'))
      .toEqual(['2026-01-15', '2026-01-29', '2026-02-12'])
    expect(occurrencesBetween({ frequency: 'weekly', anchorOn: '2026-03-01', endOn: null }, '2026-01-01', '2026-02-28')).toEqual([])
  })

  it('finds the next quarterly and yearly date', () => {
    expect(nextOccurrence({ frequency: 'quarterly', anchorOn: '2025-12-15', endOn: null }, '2026-04-01')).toBe('2026-06-15')
    expect(nextOccurrence({ frequency: 'yearly', anchorOn: '2024-06-15', endOn: '2025-12-31' }, '2026-01-01')).toBeNull()
  })
})
