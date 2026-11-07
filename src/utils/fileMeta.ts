export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'archive' | 'code' | 'text' | 'document' | 'other'

const KIND_BY_EXTENSION: Record<string, FileKind> = {}
const register = (kind: FileKind, extensions: string) => {
  for (const extension of extensions.split(' ')) KIND_BY_EXTENSION[extension] = kind
}
register('image', 'png jpg jpeg gif webp bmp svg ico heic heif avif tif tiff')
register('video', 'mp4 mov m4v webm mkv avi flv wmv 3gp')
register('audio', 'mp3 wav flac aac m4a ogg opus wma amr')
register('pdf', 'pdf')
register('archive', 'zip rar 7z tar gz tgz bz2 xz zst iso dmg apk ipa')
register('code', 'js mjs cjs ts tsx jsx vue py go rs java kt c h cpp hpp cs php rb sh bash zsh ps1 sql html htm css scss less json yaml yml toml xml ini')
register('text', 'txt md log csv tsv rtf')
register('document', 'doc docx xls xlsx ppt pptx odt ods odp pages numbers key wps et dps')

export function fileKind(name: string): FileKind {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return 'other'
  return KIND_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? 'other'
}

const DATE_LABEL = /^(\d{4})-(\d{1,2})-(\d{1,2})$/

/** Upload folders are named `YYYY-M-D`; returns their local date, otherwise `null`. */
export function parseFolderDate(label: string): Date | null {
  const match = DATE_LABEL.exec(label)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.getMonth() === Number(match[2]) - 1 ? date : null
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Relative hint shown next to a date folder: 今天 / 昨天 / 周三 / 3月5日 / 2024年3月5日. */
export function describeFolderDate(label: string, now = new Date()): string | null {
  const date = parseFolderDate(label)
  if (!date) return null
  const days = Math.round((startOfDay(now) - date.getTime()) / 86_400_000)
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days > 1 && days < 7) return `周${'日一二三四五六'[date.getDay()]}`
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Time of upload; the date is omitted when it is already given by the folder. */
export function formatUploadTime(timestamp: number, folderLabel?: string) {
  const date = new Date(timestamp)
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const folder = folderLabel ? parseFolderDate(folderLabel) : null
  if (folder && startOfDay(date) === folder.getTime()) return time
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
}

export function countFiles(node: DirectoryNode): number {
  if (node.isFile) return 1
  return (node.children ?? []).reduce((total, child) => total + countFiles(child), 0)
}

/** Whether a node or any descendant matches the search text (same rule as the tree filter). */
export function hasSearchMatch(nodes: DirectoryNode[], pattern: string): boolean {
  if (!pattern) return true
  return nodes.some((node) => node.label.includes(pattern) || hasSearchMatch(node.children ?? [], pattern))
}
