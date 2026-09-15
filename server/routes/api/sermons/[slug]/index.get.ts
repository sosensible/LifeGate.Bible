// One sermon. A members-only sermon is refused, not described, to anyone else:
// its title and video id stay on the server.
import { canViewSermon, isTeacherOf, loadSermon, presentSermon } from '../../../../lib/sermons.ts'

export default defineEventHandler(async (event) => {
  const sermon = loadSermon({ slug: getRouterParam(event, 'slug') ?? '' })
  const viewer = await getSermonViewer(event)

  // Its own teacher may always open it, drafts included.
  const isTeacher = Boolean(sermon && isTeacherOf(sermon, viewer.session?.user.id))

  // Drafts do not exist for anyone who cannot manage sermons.
  if (!sermon || (sermon.status !== 'published' && !viewer.canManage && !isTeacher)) {
    throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  }
  if (!isTeacher && !canViewSermon(sermon, viewer)) {
    throw viewer.session
      ? createError({ statusCode: 403, statusMessage: 'This message is for members' })
      : createError({ statusCode: 401, statusMessage: 'Sign in to watch this message' })
  }

  return { sermon: { ...presentSermon(sermon), status: sermon.status }, isTeacher }
})
