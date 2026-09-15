// Category plans: saving them, and funding what they need.
// The math is in ./plan-math.ts.
import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import type { FundPlansResult, PlanInput, PlanView } from '../../shared/stewardship.ts'
import { categories, categoryPlans } from '../database/schema/index.ts'
import type { Tx } from './audit.ts'
import { monthView, setFunding } from './budget.ts'
import { db } from './db.ts'

type Reader = Tx | typeof db

export const loadPlans = (reader: Reader = db): PlanView[] =>
  reader.select().from(categoryPlans).all().map(plan => ({
    categoryId: plan.categoryId,
    source: plan.source,
    kind: plan.kind,
    cadence: plan.cadence,
    amountCents: plan.amountCents,
    dueOn: plan.dueOn,
    deadline: plan.deadline,
    repeat: plan.repeat,
    startMonth: plan.startMonth,
  }))

// Save a category's plan. A dated plan sets money aside over months, so its
// category must roll over; `switchToRollover` makes that change.
export const setPlan = (tx: Tx, categoryId: string, input: PlanInput) => {
  const category = tx.select().from(categories).where(eq(categories.id, categoryId)).get()
  if (!category) throw createError({ statusCode: 404, statusMessage: 'Category not found' })
  if (category.kind !== 'spending') throw createError({ statusCode: 400, statusMessage: 'Available to Fund cannot have a plan' })

  const setsAside = input.source === 'custom' && input.cadence === 'byDate'
  let switchedRollover = false
  if (setsAside && !category.rollover) {
    if (!input.switchToRollover) {
      throw createError({ statusCode: 409, statusMessage: `${category.name} resets each month, so money set aside would be lost. Switch it to roll over to use a dated plan.` })
    }
    tx.update(categories).set({ rollover: true }).where(eq(categories.id, categoryId)).run()
    switchedRollover = true
  }

  const values = {
    source: input.source,
    kind: input.kind,
    cadence: input.cadence,
    amountCents: input.source === 'custom' ? input.amountCents : 0,
    dueOn: input.source === 'custom' && input.cadence === 'byDate' ? input.dueOn : null,
    deadline: input.deadline,
    repeat: input.source === 'custom' && input.cadence === 'byDate' ? input.repeat : 'none' as const,
    startMonth: input.startMonth,
  }
  tx.insert(categoryPlans)
    .values({ categoryId, ...values })
    .onConflictDoUpdate({ target: categoryPlans.categoryId, set: { ...values, updatedAt: new Date() } })
    .run()
  return { category, switchedRollover }
}

export const deletePlan = (tx: Tx, categoryId: string) =>
  Boolean(tx.delete(categoryPlans).where(eq(categoryPlans.categoryId, categoryId)).returning({ id: categoryPlans.categoryId }).get())

// Fund what plans need this month, in budget order, until Available to Fund
// runs out. With dryRun nothing is saved: it is the preview.
export const fundPlans = (tx: Tx, month: string, options: { dryRun: boolean, categoryIds?: string[] }): FundPlansResult => {
  const view = monthView(month, tx)
  let available = Math.max(view.availableToFundCents, 0)
  const lines: FundPlansResult['lines'] = []

  for (const row of view.groups.flatMap(g => g.categories)) {
    const neededCents = row.plan?.neededCents ?? 0
    if (neededCents <= 0) continue
    if (options.categoryIds && !options.categoryIds.includes(row.id)) continue
    const fundCents = Math.min(neededCents, available)
    lines.push({ categoryId: row.id, name: row.name, neededCents, fundCents })
    if (fundCents > 0 && !options.dryRun) setFunding(tx, row.id, month, row.fundedCents + fundCents)
    available -= fundCents
  }

  const totalCents = lines.reduce((sum, line) => sum + line.fundCents, 0)
  return {
    month,
    lines,
    totalCents,
    shortfallCents: lines.reduce((sum, line) => sum + line.neededCents, 0) - totalCents,
    availableToFundCents: view.availableToFundCents,
  }
}
