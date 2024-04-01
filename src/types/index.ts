export interface DirectoryNode {
  key: string
  label: string
  isFile?: boolean
  children?: DirectoryNode[]
}