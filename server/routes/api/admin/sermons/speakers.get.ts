import { speakerChoices } from '../../../../lib/sermons.ts'

// Speakers to pick in the sermon form: names only. Whoever may keep the Speakers list also sees
// the church members who could be added to it by being named.
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { sermon: ['update'] })
  return { speakers: speakerChoices(await hasPermission(session.user.id, { speakers: ['update'] })) }
})
