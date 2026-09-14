// The Speakers list for the people who keep it. Staff and admins also get the archive.
import { loadSpeakerCandidates, loadSpeakers } from '../../../lib/speakers.ts'

export default defineEventHandler(async (event) => {
  const viewer = await requireSpeakersEditor(event)
  return {
    speakers: loadSpeakers(),
    archived: viewer.canDelete ? loadSpeakers('archived') : null,
    candidates: loadSpeakerCandidates(),
    canDelete: viewer.canDelete,
  }
})
