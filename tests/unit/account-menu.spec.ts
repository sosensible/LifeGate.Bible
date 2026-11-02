// The order of the signed-in person's menu: their own pages first, the rest
// alphabetical, the audit log above Help, and Sign out last.
import { describe, expect, it } from 'vitest'
import { accountMenuGroups } from '../../app/utils/account-menu'

const item = (label: string) => ({ label })
const labels = (groups: Array<Array<{ label: string }>>) => groups.map(group => group.map(entry => entry.label))

describe('the account menu', () => {
  it('keeps My Page and My Profile apart from the rest, in that order', () => {
    const groups = accountMenuGroups({
      personal: [item('My Profile'), item('My Page')],
      others: [item('Accounts')],
      support: [],
      signOut: [item('Sign Out')],
    })
    expect(labels(groups)).toEqual([['My Page', 'My Profile'], ['Accounts'], ['Sign Out']])
  })

  it('puts everything else in alphabetical order, whatever order it was found in', () => {
    const groups = accountMenuGroups({
      personal: [],
      others: ['People', 'Stewardship', 'Accounts', 'Ministries', 'Church details', 'Manage teaching', 'My lists', 'Ministry budget'].map(item),
      support: [],
      signOut: [],
    })
    expect(labels(groups)[0]).toEqual(['Accounts', 'Church details', 'Manage teaching', 'Ministries', 'Ministry budget', 'My lists', 'People', 'Stewardship'])
  })

  it('ignores case when ordering, so a lower-case word does not sink to the bottom', () => {
    expect(labels(accountMenuGroups({ personal: [], others: [item('zebra'), item('Apple'), item('mango')], support: [], signOut: [] }))[0]).toEqual(['Apple', 'mango', 'zebra'])
  })

  it('puts the audit log directly above Help, in a group of their own before Sign out', () => {
    const groups = accountMenuGroups({
      personal: [item('My Page')],
      others: [item('Accounts')],
      support: [item('Help'), item('Audit log')],
      signOut: [item('Sign Out')],
    })
    expect(labels(groups)).toEqual([['My Page'], ['Accounts'], ['Audit log', 'Help'], ['Sign Out']])
  })

  it('leaves out a group with nothing in it, so there is no empty divider', () => {
    expect(labels(accountMenuGroups({ personal: [], others: [], support: [item('Help')], signOut: [item('Sign Out')] }))).toEqual([['Help'], ['Sign Out']])
    expect(labels(accountMenuGroups({ personal: [item('My Page')], others: [], support: [], signOut: [item('Sign Out')] }))).toEqual([['My Page'], ['Sign Out']])
  })

  it('does not change the lists it was given', () => {
    const others = [item('B'), item('A')]
    accountMenuGroups({ personal: [], others, support: [], signOut: [] })
    expect(others.map(entry => entry.label)).toEqual(['B', 'A'])
  })
})
