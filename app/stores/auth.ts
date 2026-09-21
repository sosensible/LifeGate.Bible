// The signed-in session, for the UI.
//
// Populated during SSR by app/plugins/auth-session.ts, so pages and the layout
// render correctly on the first response. `can()` is only for showing or
// hiding UI; the server enforces permissions independently.
import { roles, type RoleName } from '#shared/auth/permissions'
import type { Permissions } from '~/types/auth'

type Session = typeof authClient.$Infer.Session

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)

  const user = computed(() => session.value?.user ?? null)
  const isAuthenticated = computed(() => session.value !== null)

  const roleNames = computed<RoleName[]>(() =>
    String((user.value as { role?: string } | null)?.role ?? '')
      .split(',')
      .map(role => role.trim())
      .filter((role): role is RoleName => role in roles),
  )

  // A person holds several additive roles, so check each requested action
  // against the union of their roles, not against one role at a time.
  const can = (permissions: Permissions) =>
    Object.entries(permissions).every(([resource, actions]) =>
      (actions ?? []).every(action =>
        roleNames.value.some(role =>
          roles[role].authorize({ [resource]: [action] } as never).success,
        ),
      ),
    )

  const isMember = computed(() => can({ memberArea: ['view'] }))
  const isStaff = computed(() => can({ people: ['viewContact'] }))

  const setSession = (value: Session | null) => {
    session.value = value
    // Anything the phone kept offline belongs to whoever was signed in. If that
    // is now somebody else, it goes before they can read it.
    if (import.meta.client) void claimOfflineCaches(value?.user?.id ?? null)
  }

  const refresh = async () => {
    const { data } = await authClient.getSession()
    setSession(data ?? null)
  }

  const logout = async () => {
    await authClient.signOut()
    session.value = null
    // Signing out empties the offline copies of the directory, ministries and
    // calendar. Awaited, so the phone is clear before the next page renders.
    if (import.meta.client) await purgeOfflineCaches()
  }

  return { session, user, isAuthenticated, isMember, isStaff, roleNames, can, setSession, refresh, logout }
})
