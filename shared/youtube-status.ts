// What the Church details page is told about the church's YouTube channel.
export interface YouTubeStatus {
  // The site has the Google client id and secret.
  configured: boolean
  connected: boolean
  channelTitle: string | null
  // The address to register with Google, so an administrator can copy it when setting up.
  redirectUri: string | null
}
