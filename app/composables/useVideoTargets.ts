// Where a message's video can be sent: the church's video host, the church's YouTube channel,
// or both. Asked of the server once and kept, since it only changes when an administrator
// connects something.
interface Targets {
  loaded: boolean
  host: boolean
  youtube: boolean
  // The church server keeps its own copy, in the folder chosen on Church details.
  local: boolean
  channelTitle: string | null
}

export const useVideoTargets = () => {
  const targets = useState<Targets>('video-targets', () => ({ loaded: false, host: false, youtube: false, local: false, channelTitle: null }))

  const load = async (force = false) => {
    if (targets.value.loaded && !force) return targets.value
    try {
      const { enabled, youtube, local } = await $fetch<{ enabled: boolean, youtube: { connected: boolean, channelTitle: string | null }, local: { enabled: boolean } }>('/api/admin/sermons/hosted-video')
      targets.value = { loaded: true, host: enabled, youtube: youtube.connected, local: local.enabled, channelTitle: youtube.channelTitle }
    }
    catch {
      targets.value = { loaded: true, host: false, youtube: false, local: false, channelTitle: null }
    }
    return targets.value
  }

  return { targets, load }
}
