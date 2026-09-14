// Missions: loading entries for the members-only pages, and deciding who may edit.
//
// Archiving hides an entry from members. Only staff and admins (missions:delete)
// see archived entries, restore them, or remove them for good.
import { and, asc, count, desc, eq, isNotNull, isNull, like, or } from 'drizzle-orm'
import { createError } from 'h3'
import { slugify, type MissionaryView, type OrganizationView } from '../../shared/missions.ts'
import { ministries, ministryMembers, missionaries, missionOrganizations, missionUpdates, people } from '../database/schema/index.ts'
import { db } from './db.ts'

export const photoUrl = (photo: string | null) => (photo ? `/api/missions/photos/${photo}` : null)

// Editors: staff and admins (missions:update), plus anyone whose directory
// entry serves in the Missions ministry.
export const servesInMissionsMinistry = (userId: string) =>
  Boolean(db
    .select({ personId: people.id })
    .from(people)
    .innerJoin(ministryMembers, eq(ministryMembers.personId, people.id))
    .innerJoin(ministries, eq(ministries.id, ministryMembers.ministryId))
    .where(and(eq(people.userId, userId), eq(ministries.slug, 'missions')))
    .get())

// Which entries a list holds: active (the default) or archived.
type Shelf = 'active' | 'archived'
const shelf = (column: typeof missionaries.archivedAt | typeof missionOrganizations.archivedAt, which: Shelf) =>
  which === 'archived' ? isNotNull(column) : isNull(column)

export const loadOrganizations = (options: { shelf?: Shelf, slug?: string, id?: string } = {}): OrganizationView[] => {
  // A single organization is found whether or not it is archived; callers decide who may see it.
  const where = options.slug
    ? eq(missionOrganizations.slug, options.slug)
    : options.id ? eq(missionOrganizations.id, options.id) : shelf(missionOrganizations.archivedAt, options.shelf ?? 'active')

  return db
    .select({ org: missionOrganizations, missionaryCount: count(missionaries.id) })
    .from(missionOrganizations)
    .leftJoin(missionaries, and(eq(missionaries.organizationId, missionOrganizations.id), isNull(missionaries.archivedAt)))
    .where(where)
    .groupBy(missionOrganizations.id)
    .orderBy(asc(missionOrganizations.name))
    .all()
    .map(({ org, missionaryCount }) => ({
      id: org.id,
      slug: org.slug,
      name: org.name,
      photo: org.photo,
      photoUrl: photoUrl(org.photo),
      writeup: org.writeup,
      website: org.website,
      relationship: org.relationship,
      missionaryCount,
      archivedAt: org.archivedAt?.toISOString() ?? null,
    }))
}

// Contact details reach members only when the missionaries agreed to share
// them; editors always see them, since they keep the entry.
export const loadMissionaries = (options: {
  canEdit: boolean
  // Staff and admins: an archived organization is still named on its missionaries.
  canSeeArchived?: boolean
  shelf?: Shelf
  slug?: string
  id?: string
  organizationId?: string
}): MissionaryView[] => {
  // A single missionary is found whether or not it is archived; callers decide who may see it.
  const where = options.slug
    ? eq(missionaries.slug, options.slug)
    : options.id
      ? eq(missionaries.id, options.id)
      : and(
          shelf(missionaries.archivedAt, options.shelf ?? 'active'),
          options.organizationId ? eq(missionaries.organizationId, options.organizationId) : undefined,
        )

  const rows = db
    .select({ m: missionaries, org: missionOrganizations })
    .from(missionaries)
    .leftJoin(missionOrganizations, eq(missionaries.organizationId, missionOrganizations.id))
    .where(where)
    .orderBy(asc(missionaries.name))
    .all()

  const updates = rows.length && (options.slug || options.id)
    ? db.select().from(missionUpdates).where(eq(missionUpdates.missionaryId, rows[0]!.m.id))
        .orderBy(desc(missionUpdates.postedOn), desc(missionUpdates.createdAt)).all()
    : []

  return rows.map(({ m, org }) => {
    const showContact = options.canEdit || m.shareContact
    const showOrganization = org && (!org.archivedAt || options.canSeeArchived)
    return {
      id: m.id,
      slug: m.slug,
      kind: m.kind,
      name: m.name,
      photo: m.photo,
      photoUrl: photoUrl(m.photo),
      writeup: m.writeup,
      familyNames: m.familyNames,
      field: m.field,
      focus: m.focus,
      organization: showOrganization ? { id: org.id, slug: org.slug, name: org.name } : null,
      status: m.status,
      startedYear: m.startedYear,
      supportUrl: m.supportUrl,
      ...(showContact ? { email: m.email, phone: m.phone, mailingAddress: m.mailingAddress, website: m.website } : {}),
      shareContact: m.shareContact,
      nextVisitOn: m.nextVisitOn,
      nextVisitNote: m.nextVisitNote,
      archivedAt: m.archivedAt?.toISOString() ?? null,
      updates: updates.map(({ id, kind, postedOn, title, body, url }) => ({ id, kind, postedOn, title, body, url })),
    }
  })
}

// A slug nobody else in the table has: "reyes-family", then "-2"...
export const uniqueSlug = (table: typeof missionaries | typeof missionOrganizations, name: string, exceptId?: string) => {
  // "organizations" is a page path (/missions/organizations/...), so no
  // missionary may use it as a slug.
  const base = slugify(name) || 'entry'
  const taken = new Set(['organizations', ...db.select({ id: table.id, slug: table.slug }).from(table)
    .where(or(eq(table.slug, base), like(table.slug, `${base}-%`))).all()
    .filter(row => row.id !== exceptId).map(row => row.slug)])
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

// A missionary may join an active organization. One already linked to an
// organization that was later archived may keep it.
export const assertOrganizationExists = (organizationId: string | null | undefined, currentOrganizationId?: string | null) => {
  if (!organizationId) return
  const org = db.select({ archivedAt: missionOrganizations.archivedAt }).from(missionOrganizations).where(eq(missionOrganizations.id, organizationId)).get()
  if (!org || (org.archivedAt && organizationId !== currentOrganizationId)) {
    throw createError({ statusCode: 400, statusMessage: 'That organization no longer exists' })
  }
}

// The row to change. Archived entries do not exist for people who cannot see the archive.
export const findMissionary = (id: string, canSeeArchived: boolean) => {
  const row = db.select().from(missionaries).where(eq(missionaries.id, id)).get()
  if (!row || (row.archivedAt && !canSeeArchived)) throw createError({ statusCode: 404, statusMessage: 'Missionary not found' })
  return row
}

export const findOrganization = (id: string, canSeeArchived: boolean) => {
  const row = db.select().from(missionOrganizations).where(eq(missionOrganizations.id, id)).get()
  if (!row || (row.archivedAt && !canSeeArchived)) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })
  return row
}
