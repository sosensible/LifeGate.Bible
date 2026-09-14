// Missions: loading entries for the members-only pages, and deciding who may edit.
import { and, asc, count, desc, eq, like, or } from 'drizzle-orm'
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

export const loadOrganizations = (): OrganizationView[] =>
  db
    .select({ org: missionOrganizations, missionaryCount: count(missionaries.id) })
    .from(missionOrganizations)
    .leftJoin(missionaries, eq(missionaries.organizationId, missionOrganizations.id))
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
    }))

// Contact details reach members only when the missionaries agreed to share
// them; editors always see them, since they keep the entry.
export const loadMissionaries = (options: { canEdit: boolean, slug?: string, id?: string, organizationId?: string }): MissionaryView[] => {
  const where = options.slug
    ? eq(missionaries.slug, options.slug)
    : options.id
      ? eq(missionaries.id, options.id)
      : options.organizationId ? eq(missionaries.organizationId, options.organizationId) : undefined

  const rows = db
    .select({ m: missionaries, orgId: missionOrganizations.id, orgSlug: missionOrganizations.slug, orgName: missionOrganizations.name })
    .from(missionaries)
    .leftJoin(missionOrganizations, eq(missionaries.organizationId, missionOrganizations.id))
    .where(where)
    .orderBy(asc(missionaries.name))
    .all()

  const updates = rows.length && (options.slug || options.id)
    ? db.select().from(missionUpdates).where(eq(missionUpdates.missionaryId, rows[0]!.m.id))
        .orderBy(desc(missionUpdates.postedOn), desc(missionUpdates.createdAt)).all()
    : []

  return rows.map(({ m, orgId, orgSlug, orgName }) => {
    const showContact = options.canEdit || m.shareContact
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
      organization: orgId && orgSlug && orgName ? { id: orgId, slug: orgSlug, name: orgName } : null,
      status: m.status,
      startedYear: m.startedYear,
      supportUrl: m.supportUrl,
      ...(showContact ? { email: m.email, phone: m.phone, mailingAddress: m.mailingAddress, website: m.website } : {}),
      shareContact: m.shareContact,
      nextVisitOn: m.nextVisitOn,
      nextVisitNote: m.nextVisitNote,
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

export const assertOrganizationExists = (organizationId: string | null | undefined) => {
  if (!organizationId) return
  if (!db.select({ id: missionOrganizations.id }).from(missionOrganizations).where(eq(missionOrganizations.id, organizationId)).get()) {
    throw createError({ statusCode: 400, statusMessage: 'That organization no longer exists' })
  }
}
