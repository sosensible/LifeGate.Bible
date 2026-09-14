import { describe, expect, it } from 'vitest'
import { presentPerson, type PersonRecord, type Viewer } from '../../shared/privacy'

const adult: PersonRecord = {
  id: 'p1', firstName: 'Helen', lastName: 'Johnson', isMinor: false,
  phone: '(269) 555-0108', email: 'hjohnson@example.org', address: '258 Oak Park Drive',
  birthday: '1961-09-03', photoUrl: '/photos/p1.jpg', householdId: 'h1',
  sharePhone: false, shareEmail: false, shareAddress: false,
  shareBirthday: false, sharePhoto: false, shareHousehold: false,
}

const PUBLIC: Viewer = { isMember: false, isStaff: false }
const MEMBER: Viewer = { isMember: true, isStaff: false }
const STAFF: Viewer = { isMember: true, isStaff: true }

describe('directory privacy', () => {
  it('shows the public nothing at all', () => {
    expect(presentPerson({ ...adult, sharePhone: true, shareBirthday: true }, PUBLIC)).toBeNull()
  })

  it('shows members only an adult name when nothing is opted in', () => {
    expect(presentPerson(adult, MEMBER)).toEqual({ id: 'p1', firstName: 'Helen', lastName: 'Johnson' })
  })

  it('never lists minors to members, even with every opt-in set', () => {
    const child = { ...adult, isMinor: true, sharePhone: true, shareBirthday: true, sharePhoto: true }
    expect(presentPerson(child, MEMBER)).toBeNull()
  })

  it('shows members each field only once that field is opted in', () => {
    const entry = presentPerson({ ...adult, shareEmail: true }, MEMBER)!
    expect(entry.email).toBe('hjohnson@example.org')
    expect(entry).not.toHaveProperty('phone')
    expect(entry).not.toHaveProperty('address')
  })

  it('gives staff contact info without any opt-in', () => {
    const entry = presentPerson(adult, STAFF)!
    expect(entry.phone).toBe('(269) 555-0108')
    expect(entry.email).toBe('hjohnson@example.org')
    expect(entry.address).toBe('258 Oak Park Drive')
  })

  it('keeps non-contact fields opt-in even for staff', () => {
    const entry = presentPerson(adult, STAFF)!
    expect(entry).not.toHaveProperty('birthday')
    expect(entry).not.toHaveProperty('photoUrl')
    expect(entry).not.toHaveProperty('householdId')
  })

  it('shares birthday as month and day only, never the year', () => {
    const entry = presentPerson({ ...adult, shareBirthday: true }, MEMBER)!
    expect(entry.birthday).toBe('09-03')
    expect(JSON.stringify(entry)).not.toContain('1961')
  })

  it('shows title and ministries with the name, without any opt-in', () => {
    const ministries = [{ slug: 'nursery', name: 'Nursery' }]
    expect(presentPerson({ ...adult, title: 'Deacon', ministries }, MEMBER)).toEqual({
      id: 'p1', firstName: 'Helen', lastName: 'Johnson', title: 'Deacon', ministries,
    })
  })

  it('shows the household name only when the household is shared', () => {
    const named = { ...adult, householdName: 'Johnson Family' }
    expect(presentPerson(named, STAFF)).not.toHaveProperty('householdName')
    expect(presentPerson({ ...named, shareHousehold: true }, MEMBER)!.householdName).toBe('Johnson Family')
  })

  it('omits hidden fields entirely rather than sending null', () => {
    const json = JSON.stringify(presentPerson(adult, MEMBER))
    expect(json).not.toContain('phone')
    expect(json).not.toContain('555-0108')
  })
})
