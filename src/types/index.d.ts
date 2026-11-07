declare interface DirectoryNode {
  key: string
  label: string
  isFile?: boolean
  children?: DirectoryNode[]
  size?: number
  /** Needs a password (or admin) to open. */
  locked?: boolean
  /** Upload time in milliseconds since epoch. */
  uploadedAt?: number
}

declare type AnyArray = any[]

declare type AnyObject = Record<string, any>
