// The keys and ids for the church video host and YouTube, and the folder for local copies, that an administrator enters on
// Church details (server/lib/integration-secrets.ts). Shared so the screen and the server agree
// on the names; the values themselves never leave the server except the ones that are not secret.
export const INTEGRATION_FIELD_NAMES = ['bunny.libraryId', 'bunny.apiKey', 'bunny.tokenKey', 'bunny.cdnHost', 'youtube.clientId', 'youtube.clientSecret', 'local.path'] as const
export type IntegrationField = typeof INTEGRATION_FIELD_NAMES[number]

// Where a value comes from: entered on Church details, from the server's environment, or kept
// but no longer readable (the site's secret changed), so it must be entered again.
export type SecretSource = 'ui' | 'env' | 'unreadable' | null

// What a screen is told: where each came from, and the value only where it is not secret.
export type IntegrationView = Record<IntegrationField, { source: SecretSource, value: string | null }>
