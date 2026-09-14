import type { statement } from '#shared/auth/permissions'

export type Permissions = {
  [Resource in keyof typeof statement]?: Array<(typeof statement)[Resource][number]>
}
