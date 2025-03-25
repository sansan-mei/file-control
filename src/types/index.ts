export interface DirectoryNode {
  key: string
  label: string
  isFile?: boolean
  children?: DirectoryNode[]
  size?: number
}

export type AnyArray = any[]

export type AnyObject = Record<string, any>
