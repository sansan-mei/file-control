import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
it('registers the same-origin scoped service worker without requesting notification permission', async () => {
  const register = vi.fn(async () => ({}))
  const requestPermission = vi.fn()
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } })
  vi.stubGlobal('Notification', { permission: 'default', requestPermission })
  const { registerPwa } = await import('../src/pwa')
  await registerPwa()
  await flushPromises()
  expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' })
  expect(requestPermission).not.toHaveBeenCalled()
})

it('retries registration after an actual registration failure instead of caching failure forever', async () => {
  const worker = { active: { state: 'activated' } }
  const register = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(worker)
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } })
  const { registerPwa } = await import('../src/pwa')
  const failed = registerPwa()
  expect(registerPwa()).toBe(failed)
  expect(await failed).toBeUndefined()
  expect(await registerPwa()).toBe(worker)
  expect(register).toHaveBeenCalledTimes(2)
  expect(await registerPwa()).toBe(worker)
  expect(register).toHaveBeenCalledTimes(2)
})

it.each([
  { enabled: false, stored: '1', blockedRead: false },
  { enabled: true, stored: '0', blockedRead: false },
  { enabled: true, stored: '0', blockedRead: true }
])('keeps explicit page choice $enabled on refresh when persistence fails (blocked read: $blockedRead)', async ({ enabled, stored, blockedRead }) => {
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('Notification', { permission: 'granted' })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} })
  vi.stubGlobal('localStorage', {
    getItem: () => { if (blockedRead) throw new Error('blocked'); return stored },
    setItem: () => { throw new Error('blocked') }
  })
  const pwa = await import('../src/pwa')
  await pwa.setNotifications(enabled)
  expect(pwa.notificationState.enabled).toBe(enabled)
  pwa.refreshNotifications()
  expect(pwa.notificationState.enabled).toBe(enabled)
  vi.stubGlobal('Notification', { permission: 'denied' })
  pwa.refreshNotifications()
  expect(pwa.notificationState.enabled).toBe(false)
  vi.stubGlobal('Notification', { permission: 'granted' })
  pwa.refreshNotifications()
  expect(pwa.notificationState.enabled).toBe(enabled)
})

it('requires explicit opt-in, persists only granted permission, handles denied/unsupported safely', async () => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
  vi.stubGlobal('isSecureContext', true)
  const requestPermission = vi.fn(async () => 'denied')
  vi.stubGlobal('Notification', { permission: 'default', requestPermission })
  const pwa = await import('../src/pwa')
  expect(requestPermission).not.toHaveBeenCalled()
  expect(pwa.notificationState.enabled).toBe(false)
  await pwa.setNotifications(true)
  expect(requestPermission).toHaveBeenCalledOnce()
  expect(pwa.notificationState.permission).toBe('denied')
  expect(pwa.notificationState.enabled).toBe(false)
  expect(window.localStorage.getItem('file-control-transfer-notifications')).not.toBe('1')
  vi.stubGlobal('Notification', undefined)
  await pwa.setNotifications(true)
  expect(pwa.notificationState.supported).toBe(false)
  expect(pwa.notificationState.enabled).toBe(false)
})
