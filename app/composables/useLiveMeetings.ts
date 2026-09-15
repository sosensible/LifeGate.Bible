// Live meetings showing now. Meetings open and close on the clock, so this
// checks again every minute while the page is open.
export const useLiveMeetings = () => {
  const request = useFetch('/api/live', { key: 'live-now' })
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    timer = setInterval(() => request.refresh(), 60_000)
  })
  onBeforeUnmount(() => clearInterval(timer))
  return request
}
