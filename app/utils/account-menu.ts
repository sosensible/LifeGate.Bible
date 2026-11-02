// The signed-in person's menu, in groups with a divider between each:
//
//   1. Their own page and profile.
//   2. Everything else they can open, alphabetical.
//   3. Oversight and help: the audit log above Help.
//   4. Sign out.
//   5. Which release this is, for administrators to check against.
//
// Which entries a person gets is decided in the layout, from what they may do. This
// only puts them in order, and leaves out a group with nothing in it.
export interface MenuEntry { label: string }

const byLabel = (a: MenuEntry, b: MenuEntry) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' })

export const accountMenuGroups = <T extends MenuEntry>(groups: { personal: T[], others: T[], support: T[], signOut: T[], footer?: T[] }): T[][] =>
  [
    [...groups.personal].sort(byLabel),
    [...groups.others].sort(byLabel),
    // Audit log, then Help: alphabetical is the order wanted.
    [...groups.support].sort(byLabel),
    groups.signOut,
    groups.footer ?? [],
  ].filter(group => group.length)
