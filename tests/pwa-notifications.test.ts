import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
let pwa: typeof import('../src/pwa')
const showNotification = vi.fn<(title: string, options: NotificationOptions) => Promise<void>>(async () => {})
beforeEach(async () => {
  vi.resetModules()
  pwa = await import('../src/pwa')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
  vi.stubGlobal('localStorage', { getItem: () => '1', setItem: vi.fn() })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: vi.fn(async () => ({ active: { state: 'activated' }, showNotification })) } })
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  showNotification.mockClear()
  await pwa.setNotifications(true)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function pendingRegistration() {
  const worker = Object.assign(new EventTarget(), { state: 'installing' })
  const registration = Object.assign(new EventTarget(), { active: null as typeof worker | null, installing: worker, waiting: null, showNotification })
  const add = vi.spyOn(worker, 'addEventListener')
  const remove = vi.spyOn(worker, 'removeEventListener')
  const registrationAdd = vi.spyOn(registration, 'addEventListener')
  const registrationRemove = vi.spyOn(registration, 'removeEventListener')
  vi.mocked(navigator.serviceWorker.register).mockResolvedValue(registration as unknown as ServiceWorkerRegistration)
  const activate = () => {
    worker.state = 'activated'
    registration.active = worker
    worker.dispatchEvent(new Event('statechange'))
  }
  const expectCleanedUp = () => {
    expect(add).toHaveBeenCalledWith('statechange', expect.any(Function))
    for (const args of add.mock.calls) expect(remove).toHaveBeenCalledWith(...args)
    for (const args of registrationAdd.mock.calls) expect(registrationRemove).toHaveBeenCalledWith(...args)
    expect(vi.getTimerCount()).toBe(0)
  }
  return { worker, registration, activate, expectCleanedUp }
}

it('waits for its own first worker activation and delivers the original batch exactly once', async () => {
  const pending = pendingRegistration()
  const unrelatedNotification = vi.fn()
  Object.defineProperty(navigator.serviceWorker, 'ready', { configurable: true, value: Promise.resolve({ active: {}, showNotification: unrelatedNotification }) })
  const notifier = pwa.createTransferNotifier()
  notifier.complete(1, 'success')
  notifier.complete(2, 'error')
  await vi.advanceTimersByTimeAsync(800)
  expect(showNotification).not.toHaveBeenCalled()
  expect(pwa.notificationState.error).toBe('')
  pending.activate()
  await flushPromises()
  expect(showNotification).toHaveBeenCalledExactlyOnceWith('文件传输结果', expect.objectContaining({ body: '上传成功 1 项，失败 1 项。打开应用查看传输记录。' }))
  pending.activate()
  await flushPromises()
  expect(showNotification).toHaveBeenCalledOnce()
  expect(unrelatedNotification).not.toHaveBeenCalled()
  pending.expectCleanedUp()
  notifier.dispose()
})

it.each(['dispose', 'permission', 'foreground', 'toggle'] as const)('cancels notification after activation wait when %s changes', async change => {
  const pending = pendingRegistration()
  const notifier = pwa.createTransferNotifier()
  notifier.complete(1, 'success')
  await vi.advanceTimersByTimeAsync(800)
  expect(pwa.notificationState.error).toBe('')
  if (change === 'dispose') {
    notifier.dispose()
    pending.expectCleanedUp()
  } else if (change === 'permission') vi.stubGlobal('Notification', { permission: 'denied' })
  else if (change === 'foreground') vi.mocked(document.hasFocus).mockReturnValue(true)
  else await pwa.setNotifications(false)
  pending.activate()
  await flushPromises()
  expect(showNotification).not.toHaveBeenCalled()
  expect(pwa.notificationState.error).toBe('')
  pending.expectCleanedUp()
  notifier.dispose()
})

it.each(['redundant', 'timeout'] as const)('bounds activation wait and removes listeners on %s, without late delivery', async failure => {
  const pending = pendingRegistration()
  const notifier = pwa.createTransferNotifier()
  notifier.complete(1, 'success')
  await vi.advanceTimersByTimeAsync(800)
  expect(pwa.notificationState.error).toBe('')
  if (failure === 'redundant') {
    pending.worker.state = 'redundant'
    pending.worker.dispatchEvent(new Event('statechange'))
  } else await vi.advanceTimersByTimeAsync(10000)
  await flushPromises()
  expect(pwa.notificationState.error).toContain('通知暂不可用')
  pending.expectCleanedUp()
  pending.activate()
  await flushPromises()
  expect(showNotification).not.toHaveBeenCalled()
  notifier.dispose()
})

it('keeps batches distinct while activation is pending and leaves foreground feedback synchronous', async () => {
  const pending = pendingRegistration()
  const notifier = pwa.createTransferNotifier()
  expect(notifier.complete(1, 'success')).toBe(true)
  await vi.advanceTimersByTimeAsync(800)
  expect(pwa.notificationState.error).toBe('')
  vi.mocked(document.hasFocus).mockReturnValue(true)
  expect(notifier.complete(2, 'success')).toBe(false) // caller must show its foreground toast now
  vi.mocked(document.hasFocus).mockReturnValue(false)
  expect(notifier.complete(3, 'error')).toBe(true)
  expect(notifier.complete(1, 'success')).toBe(false)
  await vi.advanceTimersByTimeAsync(800)
  pending.activate()
  await flushPromises()
  expect(showNotification.mock.calls.map(([, options]) => (options as NotificationOptions).body)).toEqual([
    '上传成功 1 项，失败 0 项。打开应用查看传输记录。',
    '上传成功 0 项，失败 1 项。打开应用查看传输记录。'
  ])
  pending.expectCleanedUp()
  notifier.dispose()
})

it('batches background successes/failures, deduplicates transfer ids, hides filenames and uses actual SW showNotification', async () => {
  const notifier = pwa.createTransferNotifier()
  expect(notifier.complete(1, 'success')).toBe(true)
  expect(notifier.complete(1, 'success')).toBe(false)
  notifier.complete(2, 'error')
  expect(showNotification).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(800)
  await flushPromises()
  expect(showNotification).toHaveBeenCalledExactlyOnceWith('文件传输结果', expect.objectContaining({ body: '上传成功 1 项，失败 1 项。打开应用查看传输记录。', tag: 'file-control-transfers', icon: '/icons/icon-192.png', data: { url: '/' } }))
  notifier.dispose()
})
it('does not notify foreground users, respects opt-out/revocation and cancels timers on unmount', async () => {
  const notifier = pwa.createTransferNotifier()
  vi.mocked(document.hasFocus).mockReturnValue(true)
  expect(notifier.complete(1, 'success')).toBe(false)
  vi.mocked(document.hasFocus).mockReturnValue(false)
  expect(notifier.complete(2, 'error')).toBe(true)
  await pwa.setNotifications(false)
  await vi.advanceTimersByTimeAsync(800)
  expect(showNotification).not.toHaveBeenCalled()
  await pwa.setNotifications(true)
  notifier.complete(3, 'success')
  notifier.dispose()
  await vi.advanceTimersByTimeAsync(800)
  expect(showNotification).not.toHaveBeenCalled()
  expect(notifier.complete(4, 'error')).toBe(false)
})
