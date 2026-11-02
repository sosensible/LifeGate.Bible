// What the Church details page is told about moving the stored videos to another folder.
export interface FolderMoveView {
  state: 'running' | 'failed' | 'done'
  from: string
  to: string
  filesTotal: number
  filesMoved: number
  bytesTotal: number
  bytesMoved: number
  error: string | null
  startedAt: string
}
