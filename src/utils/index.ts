import { copyToClip, getCookieValue, setCookieValue } from 'mei-utils/client'

export { copyToClip, getCookieValue, setCookieValue }

// 通过编码值打开图片
export function openUrlByKey({ key, label }: { key: any; label: any }): Window | null {
  const url = `/api/check-file/${encodeURIComponent(key as string)}/${encodeURIComponent(label as string)}`
  const win = window.open(url)
  return win
}

openUrlByKey.getFullPath = ({ key, label }: { key: any; label: any }) => {
  return `${location.origin}/api/check-file/${encodeURIComponent(key as string)}/${encodeURIComponent(label as string)}`
}
