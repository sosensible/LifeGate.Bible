import { describe, expect, it } from 'vitest'
import { roles } from '../../shared/auth/permissions'

const allows = (role: keyof typeof roles, permissions: Record<string, string[]>) =>
  // Better Auth access-control roles expose authorize(); success reports the result.
  roles[role].authorize(permissions as never).success

describe('roles', () => {
  it('gives a plain account no access to the member area', () => {
    expect(allows('user', { memberArea: ['view'] })).toBe(false)
    expect(allows('user', { directory: ['view'] })).toBe(false)
  })

  it('lets members into the member area and directory, and nothing staff-only', () => {
    expect(allows('member', { memberArea: ['view'], directory: ['view'] })).toBe(true)
    expect(allows('member', { people: ['viewContact'] })).toBe(false)
    expect(allows('member', { sermon: ['create'] })).toBe(false)
  })

  it('treats contact access as the staff marker', () => {
    expect(allows('pastor', { people: ['viewContact'] })).toBe(true)
    expect(allows('directoryManager', { people: ['viewContact'] })).toBe(true)
    expect(allows('admin', { people: ['viewContact'] })).toBe(true)
    expect(allows('contentEditor', { people: ['viewContact'] })).toBe(false)
  })

  it('restricts pastoral applications to the search committee, excluding admins', () => {
    expect(allows('searchCommittee', { pastoralApplication: ['view'] })).toBe(true)
    expect(allows('admin', { pastoralApplication: ['view'] })).toBe(false)
    expect(allows('pastor', { pastoralApplication: ['view'] })).toBe(false)
  })

  it('lets content editors publish sermons but not manage people', () => {
    expect(allows('contentEditor', { sermon: ['publish'] })).toBe(true)
    expect(allows('contentEditor', { people: ['update'] })).toBe(false)
  })
})

describe('stewardship', () => {
  it('lets the treasurer keep the budget and the finance committee only read it', () => {
    expect(allows('treasurer', { stewardship: ['view', 'manage'] })).toBe(true)
    expect(allows('financeCommittee', { stewardship: ['view'] })).toBe(true)
    expect(allows('financeCommittee', { stewardship: ['manage'] })).toBe(false)
  })

  it('lets pastors, deacons and the church secretary grant ministry access without seeing amounts', () => {
    for (const role of ['pastor', 'deacon', 'churchSecretary'] as const) {
      expect(allows(role, { stewardship: ['grantAccess'] })).toBe(true)
      expect(allows(role, { stewardship: ['view'] })).toBe(false)
      expect(allows(role, { stewardship: ['manage'] })).toBe(false)
    }
  })

  it('gives admins and other roles no financial access', () => {
    for (const role of ['admin', 'member', 'directoryManager', 'contentEditor', 'searchCommittee'] as const) {
      expect(allows(role, { stewardship: ['view'] })).toBe(false)
      expect(allows(role, { stewardship: ['manage'] })).toBe(false)
      expect(allows(role, { stewardship: ['grantAccess'] })).toBe(false)
    }
  })
})

describe('ministries', () => {
  it('lets the church secretary, content editors and admins edit ministries, and not deacons or members', () => {
    for (const role of ['churchSecretary', 'contentEditor', 'admin'] as const) expect(allows(role, { ministry: ['update'] })).toBe(true)
    for (const role of ['deacon', 'member', 'treasurer', 'counter'] as const) expect(allows(role, { ministry: ['update'] })).toBe(false)
  })
})

describe('giving', () => {
  it('lets the treasurer keep giving and counters only enter gifts', () => {
    expect(allows('treasurer', { giving: ['record', 'view', 'manage'] })).toBe(true)
    expect(allows('counter', { giving: ['record'] })).toBe(true)
    expect(allows('counter', { giving: ['view'] })).toBe(false)
    expect(allows('counter', { giving: ['manage'] })).toBe(false)
    expect(allows('counter', { stewardship: ['view'] })).toBe(false)
  })

  it('keeps donor-level giving from admins, pastors, deacons and the finance committee', () => {
    for (const role of ['admin', 'pastor', 'deacon', 'churchSecretary', 'financeCommittee', 'member', 'directoryManager'] as const) {
      expect(allows(role, { giving: ['record'] })).toBe(false)
      expect(allows(role, { giving: ['view'] })).toBe(false)
      expect(allows(role, { giving: ['manage'] })).toBe(false)
    }
  })
})

describe('archives', () => {
  it('lets staff and admins restore and remove, but content editors only archive speakers', () => {
    for (const role of ['pastor', 'directoryManager', 'admin'] as const) {
      expect(allows(role, { missions: ['delete'] })).toBe(true)
      expect(allows(role, { speakers: ['delete'] })).toBe(true)
    }
    expect(allows('contentEditor', { speakers: ['update'] })).toBe(true)
    expect(allows('contentEditor', { speakers: ['delete'] })).toBe(false)
    expect(allows('member', { missions: ['update'] })).toBe(false)
    expect(allows('member', { speakers: ['update'] })).toBe(false)
  })
})
