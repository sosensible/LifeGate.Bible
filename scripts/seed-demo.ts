// Fill a LOCAL database with made-up people for development.
//
//   npm run db:seed-demo
//
// Refuses to run in production, and does nothing if the directory already has
// people, so it cannot mix fake records into real ones. Phone numbers use the
// fictional 555-01xx range and emails use example.org.
import { eq } from 'drizzle-orm'
import { householdSchema } from '../shared/households.ts'
import { ministries, people } from '../server/database/schema/index.ts'
import { db } from '../server/lib/db.ts'
import { saveHousehold } from '../server/lib/households.ts'
import { setMinistries } from '../server/lib/people.ts'

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data with NODE_ENV=production.')
  process.exit(1)
}

if (db.select({ id: people.id }).from(people).limit(1).get()) {
  console.error('The directory already has people. Demo data is only added to an empty directory.')
  process.exit(1)
}

interface DemoPerson {
  firstName: string
  lastName: string
  title?: string
  isMinor?: boolean
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
  { firstName: 'Robert', lastName: 'Hayes', title: 'Elder', phone: '(269) 555-0102', email: 'rhayes@example.org', address: '456 Maple Ave, Eau Claire, MI', birthday: '1959-07-04', ministries: ['Teacher (Sunday School)', 'Elder Board'], shares: ['shareEmail'] },
  { firstName: 'Linda', lastName: 'Hayes', phone: '(269) 555-0112', email: 'lhayes@example.org', address: '456 Maple Ave, Eau Claire, MI', birthday: '1962-01-27', ministries: ['Visitation'], shares: ['shareHousehold'] },
  { firstName: 'Patricia', lastName: 'Summers', phone: '(269) 555-0103', email: 'psummers@example.org', address: '789 Pine Road, Eau Claire, MI', birthday: '1981-10-22', ministries: ['Nursery', 'Decoration'], shares: [] },
  { firstName: 'Thomas', lastName: 'Olson', phone: '(269) 555-0104', email: 'tolson@example.org', address: '321 Elm Street, Eau Claire, MI', birthday: '1975-02-08', ministries: ['Hospitality', 'Dinners'], shares: ['sharePhone', 'shareAddress'] },
  { firstName: 'Dorothy', lastName: 'Perkins', phone: '(269) 555-0105', email: 'dperkins@example.org', address: '654 Cedar Lane, Eau Claire, MI', birthday: '1948-08-30', ministries: ['Music', 'Missions'], shares: ['sharePhone', 'shareBirthday'] },
  { firstName: 'Michael', lastName: 'Torres', phone: '(269) 555-0106', email: 'mtorres@example.org', address: '987 Birch Blvd, Eau Claire, MI', birthday: '1990-12-12', ministries: ['Evangelism', 'IT (Information Technology)'], shares: ['shareEmail', 'sharePhone'] },
  { firstName: 'Lucas', lastName: 'Torres', isMinor: true, birthday: '2016-04-09', ministries: [], shares: [] },
  { firstName: 'William', lastName: 'Carter', title: 'Deacon', phone: '(269) 555-0107', email: 'wcarter@example.org', address: '147 Willow Way, Eau Claire, MI', birthday: '1963-05-19', ministries: ['Grounds & Facilities', 'Deacons'], shares: [] },
  { firstName: 'Helen', lastName: 'Johnson', phone: '(269) 555-0108', email: 'hjohnson@example.org', address: '258 Oak Park Drive, Eau Claire, MI', birthday: '1961-09-03', ministries: ['Nursery', 'Hospitality', 'Dinners'], shares: ['sharePhone', 'shareEmail', 'shareAddress', 'shareBirthday', 'shareHousehold'] },
]

const ministryIds = new Map(db.select({ id: ministries.id, name: ministries.name }).from(ministries).all().map(m => [m.name, m.id]))

db.transaction((tx) => {
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

const total = db.select({ id: people.id }).from(people).all().length
console.log(`Added ${total} demo people.`)

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
