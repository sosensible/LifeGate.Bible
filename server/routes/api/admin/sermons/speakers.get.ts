import { speakerChoices } from '../../../../lib/sermons.ts'

// Speakers to pick in the sermon form: names only.
export default defineEventHandler(async (event) => {
  await requirePermission(event, { sermon: ['update'] })
  return { speakers: speakerChoices() }
})
