// Fill a LOCAL database with made-up people for development.
//
//   npm run db:seed-demo
//
// Refuses to run in production. People are added only to an empty directory and
// missionaries only to empty Missions, so fake records never mix into real ones.
// Phone numbers use the fictional 555-01xx range and emails use example.org.
import { eq } from 'drizzle-orm'
import { householdSchema } from '../shared/households.ts'
import { ministries, missionaries, missionOrganizations, missionUpdates, people } from '../server/database/schema/index.ts'
import { db } from '../server/lib/db.ts'
import { saveHousehold } from '../server/lib/households.ts'
import { uniqueSlug } from '../server/lib/missions.ts'
import { setMinistries } from '../server/lib/people.ts'

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data with NODE_ENV=production.')
  process.exit(1)
}

const hasPeople = Boolean(db.select({ id: people.id }).from(people).limit(1).get())
const hasMissions = Boolean(db.select({ id: missionaries.id }).from(missionaries).limit(1).get())
if (hasPeople && hasMissions) {
  console.error('The directory already has people and Missions has missionaries. Demo data is only added where there is none.')
  process.exit(1)
}

interface DemoPerson {
  firstName: string
  lastName: string
  title?: string
  isMinor?: boolean
  kind?: 'member' | 'guest'
  isSpeaker?: boolean
  phone?: string
  email?: string
  address?: string
  birthday?: string
  ministries: string[]
  shares: Array<'sharePhone' | 'shareEmail' | 'shareAddress' | 'shareBirthday' | 'shareHousehold'>
}

// A spread of sharing choices, so every privacy rule has something to show.
const demo: DemoPerson[] = [
  { firstName: 'James', lastName: 'Mitchell', title: 'Deacon', phone: '(269) 555-0101', email: 'jmitchell@example.org', address: '123 Oak Street, Eau Claire, MI', birthday: '1968-03-15', ministries: ['Music', 'Deacons'], shares: ['sharePhone', 'shareEmail', 'shareHousehold', 'shareBirthday'] },
  { firstName: 'Sarah', lastName: 'Mitchell', phone: '(269) 555-0111', email: 'smitchell@example.org', address: '123 Oak Street, Eau Claire, MI', birthday: '1970-06-02', ministries: ['Hospitality'], shares: ['shareHousehold'] },
  { firstName: 'Emma', lastName: 'Mitchell', isMinor: true, birthday: '2014-11-20', ministries: [], shares: ['shareHousehold', 'shareBirthday'] },
  { firstName: 'Robert', lastName: 'Hayes', title: 'Elder', isSpeaker: true, phone: '(269) 555-0102', email: 'rhayes@example.org', address: '456 Maple Ave, Eau Claire, MI', birthday: '1959-07-04', ministries: ['Teacher (Sunday School)', 'Elder Board'], shares: ['shareEmail'] },
  { firstName: 'Linda', lastName: 'Hayes', phone: '(269) 555-0112', email: 'lhayes@example.org', address: '456 Maple Ave, Eau Claire, MI', birthday: '1962-01-27', ministries: ['Visitation'], shares: ['shareHousehold'] },
  { firstName: 'Patricia', lastName: 'Summers', phone: '(269) 555-0103', email: 'psummers@example.org', address: '789 Pine Road, Eau Claire, MI', birthday: '1981-10-22', ministries: ['Nursery', 'Decoration'], shares: [] },
  { firstName: 'Thomas', lastName: 'Olson', phone: '(269) 555-0104', email: 'tolson@example.org', address: '321 Elm Street, Eau Claire, MI', birthday: '1975-02-08', ministries: ['Hospitality', 'Dinners'], shares: ['sharePhone', 'shareAddress'] },
  { firstName: 'Dorothy', lastName: 'Perkins', phone: '(269) 555-0105', email: 'dperkins@example.org', address: '654 Cedar Lane, Eau Claire, MI', birthday: '1948-08-30', ministries: ['Music', 'Missions'], shares: ['sharePhone', 'shareBirthday'] },
  { firstName: 'Michael', lastName: 'Torres', phone: '(269) 555-0106', email: 'mtorres@example.org', address: '987 Birch Blvd, Eau Claire, MI', birthday: '1990-12-12', ministries: ['Evangelism', 'IT (Information Technology)'], shares: ['shareEmail', 'sharePhone'] },
  { firstName: 'Lucas', lastName: 'Torres', isMinor: true, birthday: '2016-04-09', ministries: [], shares: [] },
  { firstName: 'William', lastName: 'Carter', title: 'Deacon', phone: '(269) 555-0107', email: 'wcarter@example.org', address: '147 Willow Way, Eau Claire, MI', birthday: '1963-05-19', ministries: ['Grounds & Facilities', 'Deacons'], shares: [] },
  { firstName: 'Daniel', lastName: 'Brooks', title: 'Pastor', kind: 'guest', isSpeaker: true, phone: '(616) 555-0109', email: 'dbrooks@example.org', ministries: [], shares: ['shareEmail'] },
  { firstName: 'Helen', lastName: 'Johnson', phone: '(269) 555-0108', email: 'hjohnson@example.org', address: '258 Oak Park Drive, Eau Claire, MI', birthday: '1961-09-03', ministries: ['Nursery', 'Hospitality', 'Dinners'], shares: ['sharePhone', 'shareEmail', 'shareAddress', 'shareBirthday', 'shareHousehold'] },
]

const ministryIds = new Map(db.select({ id: ministries.id, name: ministries.name }).from(ministries).all().map(m => [m.name, m.id]))

if (!hasPeople) db.transaction((tx) => {
  const idOf = new Map<string, string>()

  for (const { ministries: serving, shares, ...fields } of demo) {
    const { id } = tx.insert(people).values({
      ...fields,
      ...Object.fromEntries(shares.map(share => [share, true])),
    }).returning({ id: people.id }).get()
    idOf.set(fields.firstName, id)

    const ids = serving.map((name) => {
      const ministryId = ministryIds.get(name)
      if (!ministryId) throw new Error(`Unknown ministry "${name}" -- run npm run db:migrate first`)
      return ministryId
    })
    setMinistries(tx, id, ids)
  }

  // One of each kind of household.
  const id = (firstName: string) => idOf.get(firstName)!
  saveHousehold(tx, null, householdSchema.parse({ kind: 'married', husbandId: id('James'), wifeId: id('Sarah'), relationship: 'family', childIds: [id('Emma')], customName: null }))
  saveHousehold(tx, null, householdSchema.parse({ kind: 'married', husbandId: id('Robert'), wifeId: id('Linda'), relationship: 'family', childIds: [], customName: null }))
  saveHousehold(tx, null, householdSchema.parse({ kind: 'singleParent', adultId: id('Michael'), role: 'father', childIds: [id('Lucas')], customName: null }))
})

if (!hasPeople) console.log(`Added ${demo.length} demo people.`)

// Missions: an organization, a family and an individual, with updates.
if (!hasMissions) {
  db.transaction((tx) => {
    const org = tx.insert(missionOrganizations).values({
      slug: uniqueSlug(missionOrganizations, 'Example Mission Board'),
      name: 'Example Mission Board',
      relationship: 'Sending agency',
      website: 'https://example.org',
      writeup: 'A made-up mission board for development.',
    }).returning({ id: missionOrganizations.id }).get()

    const family = tx.insert(missionaries).values({
      slug: uniqueSlug(missionaries, 'The Reyes Family'),
      kind: 'family',
      name: 'The Reyes Family',
      familyNames: 'Tom, Anna, Eli and Ruth',
      field: 'Peru',
      focus: 'Church planting',
      organizationId: org.id,
      status: 'onField',
      startedYear: 2015,
      writeup: 'Tom and Anna serve in the highlands, planting churches and training pastors.\n\nPlease pray for the new work in Cusco.',
      email: 'reyes@example.org',
      mailingAddress: 'PO Box 100, Example, MI',
      shareContact: true,
      nextVisitOn: '2026-11-08',
      nextVisitNote: 'Sunday morning service',
    }).returning({ id: missionaries.id }).get()

    tx.insert(missionaries).values({
      slug: uniqueSlug(missionaries, 'Grace Lin'),
      kind: 'individual',
      name: 'Grace Lin',
      field: 'East Asia',
      focus: 'Bible translation',
      organizationId: org.id,
      status: 'furlough',
      startedYear: 2019,
      writeup: 'Grace serves in a country where missionary work is restricted, so her field is not named here.',
      email: 'glin@example.org',
      shareContact: false,
    }).run()

    tx.insert(missionUpdates).values([
      { missionaryId: family.id, kind: 'prayer', postedOn: '2026-09-01', title: 'Visas', body: 'Pray for the renewal of our visas this fall.' },
      { missionaryId: family.id, kind: 'letter', postedOn: '2026-08-15', title: 'August letter', url: 'https://example.org/letters/august.pdf' },
    ]).run()
  })
  console.log('Added demo Missions.')
}

// Optionally connect a sign-in account to a demo person so /profile has
// something to show:  npm run db:seed-demo -- member@lifegate.test Helen
const [email, firstName] = process.argv.slice(2)
if (email && firstName) {
  const { user } = await import('../server/database/schema/index.ts')
  const account = db.select({ id: user.id }).from(user).where(eq(user.email, email.toLowerCase())).get()
  const person = db.select({ id: people.id }).from(people).where(eq(people.firstName, firstName)).get()
  if (account && person) {
    db.update(people).set({ userId: account.id }).where(eq(people.id, person.id)).run()
    console.log(`Linked ${email} to ${firstName}.`)
  }
  else {
    console.log(`Could not link: ${account ? '' : `no account ${email}. `}${person ? '' : `no person named ${firstName}.`}`)
  }
}
