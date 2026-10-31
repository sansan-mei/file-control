/* Public assets only. No app HTML, file data, API responses or runtime caching. */
const CACHE = 'file-control-public-v2'
// This document is generated locally, never fetched from an authenticated server.
const OFFLINE_HTML = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文件服务 · 离线</title><body style="font-family:system-ui;background:#eef3ff;color:#25304f;padding:10vh 8vw"><h1>当前离线</h1><p>请连接网络后重新打开文件服务。为保护隐私，文件列表、密码、上传和下载内容不会离线缓存。</p><p>离线时不能传输文件，也不会收到新的传输通知。</p><a href="/">重新连接</a></body></html>'
const PUBLIC = new Map([
  ['/icons/icon-192.png', 'image/png'],
  ['/icons/icon-512.png', 'image/png'],
  ['/icons/maskable-512.png', 'image/png']
])
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await cache.put('/offline.html', new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
    for (const [path, type] of PUBLIC) {
      const response = await fetch(path, { credentials: 'omit', redirect: 'error', cache: 'reload' })
      if (!response.ok || response.redirected || !response.headers.get('Content-Type')?.startsWith(type) || /no-store|private/i.test(response.headers.get('Cache-Control') || '')) throw new Error('Unsafe public asset response')
      await cache.put(path, response)
    }
  })())
})
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('file-control-public-') && key !== CACHE) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})
self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search) return
  if (PUBLIC.has(url.pathname) || url.pathname === '/offline.html') {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(request)))
  } else if (request.mode === 'navigate' && url.pathname === '/') {
    // Network first, never persist even the root response (it may be authenticated).
    event.respondWith(fetch(request).catch(async () => (await (await caches.open(CACHE)).match('/offline.html')) || Response.error()))
  }
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    // Fixed destination: never trust notification data or navigate a private file tab.
    const target = new URL('/', self.location.origin)
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      const url = new URL(client.url)
      if (url.origin === target.origin && url.pathname === '/' && !url.search) {
        try { await client.focus(); return } catch { /* try another app window */ }
      }
    }
    await self.clients.openWindow(target.href)
  })())
})
