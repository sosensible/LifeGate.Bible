import type { Permissions } from './auth'

declare module '#app' {
  interface PageMeta {
    // Permission required by the `auth` middleware. Defaults to memberArea:view.
    permission?: Permissions
  }
}

export {}
