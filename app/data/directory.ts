// Shared demo directory data — consumed by the members directory and the
// ministry pages so both read from one source. Replaced by live data (Drizzle)
// in the portal phase.

export interface Member {
  id: number
  name: string
  family: string | null
  role: string
  ministries: string[]
  phone: string
  email: string
  birthday: string
  address: string
  initials: string
  color: string
}

// Canonical ministries of Lifegate Baptist Church, in the order the church lists
// them. This is the source of truth — a ministry exists whether or not a member
// is currently assigned to it. Member `ministries` values must match a `name` here.
export interface MinistryDef {
  name: string
  description: string
}

export const ministryList: MinistryDef[] = [
  { name: 'Teacher (Sunday School)', description: 'Teaching God\'s Word to all ages in our Sunday School classes before the worship service.' },
  { name: 'Preaching', description: 'Men of the congregation gifted to preach and share God\'s Word from the pulpit — a shared calling that reaches beyond the pastor alone.' },
  { name: 'Hospitality', description: 'Welcoming guests and members and fostering warm fellowship whenever the church gathers.' },
  { name: 'Grounds & Facilities', description: 'Caring for our building and grounds so Lifegate remains a place of worship and welcome.' },
  { name: 'Evangelism', description: 'Sharing the Gospel with our community and beyond, reaching the lost with the love of Christ.' },
  { name: 'Dinners', description: 'Organizing the seasonal meals where our church family gathers to share food and fellowship.' },
  { name: 'Missions', description: 'Keeping in touch with our missionaries and keeping the congregation informed and praying for their work.' },
  { name: 'Music', description: 'Leading the congregation in traditional hymns and song to the glory of God.' },
  { name: 'Nursery', description: 'Providing loving care for our youngest so parents can worship with peace of mind.' },
  { name: 'Deacons', description: 'Serving the practical and benevolent needs of the congregation and supporting the ministry of the church.' },
  { name: 'Elder Board', description: 'Providing spiritual oversight and shepherding leadership for the life and direction of the church.' },
  { name: 'IT (Information Technology)', description: 'Maintaining the church website, audio/video, and technology that supports our ministries.' },
  { name: 'Decoration', description: 'Preparing and decorating our worship space for services, seasons, and special occasions.' },
  { name: 'Bulletin', description: 'Preparing and publishing the weekly church bulletin to keep the congregation informed.' },
  { name: 'Pastoral', description: 'Shepherding the congregation through pastoral care — visitation, counsel, and support in times of need.' },
  { name: 'Visitation', description: 'Caring for the homebound, hospitalized, and those in need through regular visits and prayer.' },
  { name: 'Stewardship', description: 'Overseeing the church\'s finances and resources — receiving gifts, paying obligations, and keeping accurate records. The treasurer serves within this ministry.' },
  { name: 'Pastoral Search', description: 'Prayerfully seeking the permanent pastor God has for Lifegate — reviewing candidates and guiding the call process.' },
  { name: 'Transportation', description: 'Helping members who cannot drive get to services and church gatherings through rides and coordination.' },
]

export const members: Member[] = [
  { id: 0, name: 'Pastor Dave', family: 'Pastoral Staff', role: 'Senior Pastor', ministries: ['Preaching', 'Teacher (Sunday School)'], phone: '(269) 555-0100', email: 'pastordave@lifegate.bible', birthday: 'January 9', address: 'Lifegate Baptist Church, Eau Claire, MI', initials: 'PD', color: '#7B1828' },
  { id: 1, name: 'James Mitchell', family: 'Mitchell Family', role: 'Deacon', ministries: ['Music', 'Deacons'], phone: '(269) 555-0101', email: 'jmitchell@lifegate.bible', birthday: 'March 15', address: '123 Oak Street, Eau Claire, MI', initials: 'JM', color: '#1A5C30' },
  { id: 2, name: 'Robert Hayes', family: 'Hayes Family', role: 'Elder', ministries: ['Teacher (Sunday School)', 'Elder Board'], phone: '(269) 555-0102', email: 'rhayes@lifegate.bible', birthday: 'July 4', address: '456 Maple Ave, Eau Claire, MI', initials: 'RH', color: '#7B1828' },
  { id: 3, name: 'Patricia Summers', family: null, role: 'Member', ministries: ['Nursery', 'Decoration'], phone: '(269) 555-0103', email: 'psummers@lifegate.bible', birthday: 'October 22', address: '789 Pine Road, Eau Claire, MI', initials: 'PS', color: '#7A5828' },
  { id: 4, name: 'Thomas Olson', family: 'Olson Family', role: 'Member', ministries: ['Hospitality', 'Dinners'], phone: '(269) 555-0104', email: 'tolson@lifegate.bible', birthday: 'February 8', address: '321 Elm Street, Eau Claire, MI', initials: 'TO', color: '#256035' },
  { id: 5, name: 'Dorothy Perkins', family: null, role: 'Member', ministries: ['Music', 'Missions'], phone: '(269) 555-0105', email: 'dperkins@lifegate.bible', birthday: 'August 30', address: '654 Cedar Lane, Eau Claire, MI', initials: 'DP', color: '#5D1220' },
  { id: 6, name: 'Michael Torres', family: 'Torres Family', role: 'Member', ministries: ['Evangelism', 'IT (Information Technology)'], phone: '(269) 555-0106', email: 'mtorres@lifegate.bible', birthday: 'December 12', address: '987 Birch Blvd, Eau Claire, MI', initials: 'MT', color: '#3A4E24' },
  { id: 7, name: 'William Carter', family: null, role: 'Deacon', ministries: ['Grounds & Facilities', 'Deacons'], phone: '(269) 555-0107', email: 'wcarter@lifegate.bible', birthday: 'May 19', address: '147 Willow Way, Eau Claire, MI', initials: 'WC', color: '#4A3224' },
  { id: 8, name: 'Helen Johnson', family: 'Johnson Family', role: 'Member', ministries: ['Nursery', 'Hospitality', 'Dinners'], phone: '(269) 555-0108', email: 'hjohnson@lifegate.bible', birthday: 'September 3', address: '258 Oak Park Drive, Eau Claire, MI', initials: 'HJ', color: '#2A3C6C' },
]

export function ministrySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface Ministry {
  name: string
  slug: string
  description: string
  members: Member[]
}

// All ministries, alphabetical by name, each with the members currently serving in it.
export function allMinistries(): Ministry[] {
  return ministryList
    .map(def => ({
      name: def.name,
      slug: ministrySlug(def.name),
      description: def.description,
      members: members.filter(m => m.ministries.includes(def.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function ministryBySlug(slug: string): Ministry | undefined {
  return allMinistries().find(m => m.slug === slug)
}
