import { copyToClip, getCookieValue, setCookieValue } from 'mei-utils/client'

export { copyToClip, getCookieValue, setCookieValue }

type FileRef = { key: any; label: any }

/** Download/preview URL; the optional password segment is understood by the server. */
export function fileUrl({ key, label }: FileRef, password?: string, absolute = false) {
  const path = `/api/check-file/${encodeURIComponent(key as string)}/${encodeURIComponent(label as string)}${
    password ? `/${encodeURIComponent(password)}` : ''
  }`
  return absolute ? `${location.origin}${path}` : path
}

// 通过编码值打开图片
export function openUrlByKey(item: FileRef, password?: string): Window | null {
  return window.open(fileUrl(item, password))
}

openUrlByKey.getFullPath = (item: FileRef, password?: string) => fileUrl(item, password, true)

/** Saves a file instead of previewing it (same-origin `download` attribute). */
export function downloadFile(item: FileRef, password?: string) {
  const link = document.createElement('a')
  link.href = fileUrl(item, password)
  link.download = String(item.label)
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export const formatFileSize = (size: number) => {
  if (size < 1024) return `${size.toFixed(2)}B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)}KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)}MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)}GB`
}
