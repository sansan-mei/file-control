// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import vm from 'node:vm'
import { expect, it, vi } from 'vitest'

function worker() {
  const handlers: Record<string, (event: any) => void> = {}
  const store = new Map<string, Response>()
  const cache = { match: vi.fn(async (key: string | Request) => store.get(typeof key === 'string' ? key : key.url)), put: vi.fn(async (key: string, response: Response) => { store.set(key, response) }) }
  const fetch = vi.fn(async () => new Response('public', { headers: { 'Content-Type': 'text/css' } }))
  const clients = { claim: vi.fn(), matchAll: vi.fn(async () => [] as any[]), openWindow: vi.fn() }
  const openCache = vi.fn(async () => cache)
  const deleteCache = vi.fn(async () => true)
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), { self: { location: { origin: 'https://files.test' }, registration: { scope: 'https://files.test/' }, clients, addEventListener: (name: string, handler: any) => handlers[name] = handler }, caches: { open: openCache, keys: async () => ['file-control-public-v1', 'file-control-public-v2', 'another-app-cache'], delete: deleteCache }, fetch, URL, Response, Set, Promise })
  return { handlers, fetch, cache, store, clients, openCache, deleteCache }
}

it('refreshes previous icon caches on activation without touching another app cache', async () => {
  const { handlers, openCache, deleteCache, fetch } = worker()
  fetch.mockResolvedValue(new Response('png', { headers: { 'Content-Type': 'image/png' } }))
  let pending!: Promise<void>
  handlers.install({ waitUntil: (value: Promise<void>) => pending = value })
  await pending
  expect(openCache).toHaveBeenCalledWith('file-control-public-v2')
  handlers.activate({ waitUntil: (value: Promise<void>) => pending = value })
  await pending
  expect(deleteCache.mock.calls).toEqual([['file-control-public-v1']])
})

it('never intercepts private/API/auth/query/upload/download or cross-origin requests; only fixed public assets and clean root navigation', async () => {
  expect(existsSync('public/sw.js')).toBe(true)
  const { handlers, fetch, cache } = worker()
  for (const path of ['/api/directory-tree', '/api/check-file/hash/file', '/upload-file', '/download/a', '/auth', '/assets/private.pdf', '/icons/icon-192.png?token=secret', '/?password=secret', 'https://other.test/icons/icon-192.png']) {
    const respondWith = vi.fn()
    handlers.fetch({ request: { url: new URL(path, 'https://files.test').href, method: 'GET', mode: 'navigate' }, respondWith })
    expect(respondWith, path).not.toHaveBeenCalled()
  }
  const post = vi.fn()
  handlers.fetch({ request: { url: 'https://files.test/icons/icon-192.png', method: 'POST' }, respondWith: post })
  expect(post).not.toHaveBeenCalled()
  let response!: Promise<Response>
  handlers.fetch({ request: { url: 'https://files.test/icons/icon-192.png', method: 'GET' }, respondWith: (value: Promise<Response>) => response = value })
  expect(await (await response).text()).toBe('public')
  expect(fetch).toHaveBeenCalledOnce()
  expect(cache.put).not.toHaveBeenCalled() // runtime responses are never persisted
})

it('never persists an authentication HTML response during public asset installation', async () => {
  const { handlers, fetch, cache } = worker()
  fetch.mockResolvedValue(new Response('<html>private login session</html>', { headers: { 'Content-Type': 'text/html' } }))
  let pending!: Promise<void>
  handlers.install({ waitUntil: (value: Promise<void>) => pending = value })
  await expect(pending).rejects.toThrow('Unsafe public asset response')
  for (const [, response] of cache.put.mock.calls) expect(await response.clone().text()).not.toContain('private login session')
})

it('notification clicks ignore untrusted destinations and focus only the same-origin file app', async () => {
  const { handlers, clients } = worker()
  expect(handlers.notificationclick).toBeTypeOf('function')
  const focus = vi.fn(async () => {})
  const foreignFocus = vi.fn()
  clients.matchAll.mockResolvedValue([{ url: 'https://other.test/', focus: foreignFocus }, { url: 'https://files.test/api/check-file/hash/private', focus: foreignFocus }, { url: 'https://files.test/', focus }])
  let pending!: Promise<void>
  const close = vi.fn()
  handlers.notificationclick({ notification: { data: { url: 'https://evil.test/steal' }, close }, waitUntil: (promise: Promise<void>) => pending = promise })
  await pending
  expect(close).toHaveBeenCalledOnce()
  expect(focus).toHaveBeenCalledOnce()
  expect(foreignFocus).not.toHaveBeenCalled()
  expect(clients.openWindow).not.toHaveBeenCalled()
  clients.matchAll.mockResolvedValue([])
  handlers.notificationclick({ notification: { close }, waitUntil: (promise: Promise<void>) => pending = promise })
  await pending
  expect(clients.openWindow).toHaveBeenCalledWith('https://files.test/')
})
