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
