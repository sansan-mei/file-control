declare interface DirectoryNode {
  key: string
  label: string
  isFile?: boolean
  children?: DirectoryNode[]
  size?: number
}

declare type AnyArray = any[]

declare type AnyObject = Record<string, any>
