export function getCookieValue(cookieName = 'token') {
  const cookieValue = document.cookie.match(
    `(^|;)\\s*${cookieName}\\s*=\\s*([^;]+)`,
  )
  return decodeURIComponent((cookieValue ? cookieValue.pop() : '') as string)
}

export function setCookieValue(name: string, value: string, days = 30) {
  const date = new Date()
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000)
  const expires = `expires=${date.toUTCString()}`
  name = encodeURIComponent(name)
  value = encodeURIComponent(value)
  document.cookie = `${name}=${value};${expires};path=/;SameSite=Lax`
}

// 通过编码值打开图片
export function openUrlByKey({
  key,
  label,
}: {
  key: any
  label: any
}): Window | null {
  const url = `/api/check-file/${encodeURIComponent(key as string)}/${encodeURIComponent(label as string)}`
  const win = window.open(url)
  return win
}

openUrlByKey.getFullPath = ({
  key,
  label,
}: {
  key: any
  label: any
}) => {
  return `${location.origin}/api/check-file/${encodeURIComponent(key as string)}/${encodeURIComponent(label as string)}`
}