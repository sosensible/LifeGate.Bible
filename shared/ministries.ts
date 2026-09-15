// Ministries: validation and the shape the church office edits.
import { z } from 'zod'

export const ministrySchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(80),
  description: z.string().trim().min(1, 'Enter a short description').max(500),
})

export type MinistryInput = z.infer<typeof ministrySchema>

// The Missions ministry's slug decides who may edit the Missions pages
// (server/lib/missions.ts), so it can be renamed but not removed.
export const PROTECTED_MINISTRY_SLUGS = ['missions'] as const

export interface MinistryAdminView {
  id: string
  // Set once from the first name, so links keep working after a rename.
  slug: string
  name: string
  description: string
  servingCount: number
  leaderCount: number
  // Budget categories shared with the ministry (names are Stewardship's).
  budgetGrantCount: number
  protected: boolean
}
