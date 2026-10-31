import { reactive } from 'vue'

interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
export const installState = reactive({ installed: false, available: false, busy: false, error: '' })
let deferredPrompt: InstallPrompt | undefined
let installInitialized = false

export function initInstallTracking() {
  if (installInitialized) return
  installInitialized = true
  const standalone = window.matchMedia?.('(display-mode: standalone)')
  const sync = () => { installState.installed = !!standalone?.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone }
  sync()
  standalone?.addEventListener('change', sync)
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    deferredPrompt = event as InstallPrompt
    installState.available = true
  })
  window.addEventListener('appinstalled', () => {
    installState.installed = true
    installState.available = false
    deferredPrompt = undefined
  })
}

export async function installApp() {
  if (!deferredPrompt || installState.busy) return
  const prompt = deferredPrompt
  deferredPrompt = undefined
  installState.available = false
  installState.busy = true
  installState.error = ''
  try {
    await prompt.prompt()
    await prompt.userChoice // accepted is not proof that installation finished
  } catch {
    installState.error = '暂时无法安装，请使用浏览器菜单添加到桌面。'
  } finally {
    installState.busy = false
  }
}

const NOTIFICATION_KEY = 'file-control-transfer-notifications'
export const notificationState = reactive({ enabled: false, supported: false, permission: 'default' as NotificationPermission, busy: false, error: '' })
let pageNotificationChoice: boolean | undefined

export function refreshNotifications() {
  notificationState.supported = !!globalThis.isSecureContext && !!globalThis.Notification && 'serviceWorker' in navigator
  notificationState.permission = globalThis.Notification?.permission || 'default'
  let optedIn = pageNotificationChoice ?? false
  if (notificationState.supported && pageNotificationChoice === undefined) {
    try { optedIn = window.localStorage?.getItem(NOTIFICATION_KEY) === '1' } catch { /* storage can be blocked */ }
  }
  notificationState.enabled = notificationState.supported && notificationState.permission === 'granted' && optedIn
}

export async function setNotifications(enabled: boolean) {
  if (notificationState.busy) return
  refreshNotifications()
  notificationState.error = ''
  if (!enabled) {
    pageNotificationChoice = false
    notificationState.enabled = false
    try { window.localStorage?.setItem(NOTIFICATION_KEY, '0') } catch { /* per-page setting still applies */ }
    return
  }
  if (!notificationState.supported) return
  notificationState.busy = true
  try {
    // Must remain before any await: only the explicit settings button calls this.
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    notificationState.permission = permission
    notificationState.enabled = permission === 'granted'
    pageNotificationChoice = notificationState.enabled
    try { window.localStorage?.setItem(NOTIFICATION_KEY, notificationState.enabled ? '1' : '0') } catch { /* optional persistence */ }
  } catch {
    pageNotificationChoice = false
    notificationState.enabled = false
    notificationState.error = '无法开启系统通知，请检查浏览器权限。'
  } finally {
    notificationState.busy = false
  }
}

// Observe only the registration returned for /sw.js, never serviceWorker.ready
// (which can resolve with a different worker controlling this page).
function waitForActivation(registration: ServiceWorkerRegistration, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false)
  if (registration.active?.state === 'activated') return Promise.resolve(true)
  return new Promise(resolve => {
    const observed = new Set<ServiceWorker>()
    const finish = (active: boolean) => {
      clearTimeout(timeout)
      registration.removeEventListener('updatefound', check)
      observed.forEach(worker => worker.removeEventListener('statechange', check))
      signal.removeEventListener('abort', cancel)
      resolve(active)
    }
    const cancel = () => finish(false)
    const check = () => {
      const workers = [registration.active, registration.installing, registration.waiting].filter((worker): worker is ServiceWorker => !!worker)
      for (const worker of workers) {
        if (!observed.has(worker)) {
          observed.add(worker)
          worker.addEventListener('statechange', check)
        }
      }
      if (registration.active?.state === 'activated') finish(true)
      else if (workers.length && workers.every(worker => worker.state === 'redundant')) finish(false)
    }
    const timeout = setTimeout(() => finish(false), 10000)
    registration.addEventListener('updatefound', check)
    signal.addEventListener('abort', cancel)
    check()
  })
}

export function createTransferNotifier() {
  const seen = new Set<number>()
  let success = 0
  let error = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  const activationWaits = new Set<AbortController>()
  const eligible = () => notificationState.enabled && globalThis.Notification?.permission === 'granted' && (document.visibilityState === 'hidden' || !document.hasFocus())
  const flush = async () => {
    const body = `上传成功 ${success} 项，失败 ${error} 项。打开应用查看传输记录。`
    success = error = 0
    timer = undefined
    if (disposed || !eligible()) return
    const worker = await registerPwa()
    if (disposed || !eligible()) return
    let active = false
    if (worker && typeof worker.showNotification === 'function') {
      const controller = new AbortController()
      activationWaits.add(controller)
      try {
        active = await waitForActivation(worker, controller.signal)
      } finally {
        activationWaits.delete(controller)
      }
    }
    if (disposed || !eligible()) return
    if (!worker || !active) {
      notificationState.error = '通知暂不可用，请联网重新打开应用后重试。'
      return
    }
    try {
      await worker.showNotification('文件传输结果', { body, tag: 'file-control-transfers', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: '/' } })
    } catch {
      notificationState.error = '系统通知未能显示，请检查浏览器与系统通知设置。'
    }
  }
  return {
    complete(id: number, outcome: 'success' | 'error') {
      if (disposed || seen.has(id)) return false
      seen.add(id)
      if (seen.size > 512) seen.delete(seen.values().next().value!)
      if (!eligible()) return false
      if (outcome === 'success') success++
      else error++
      timer ??= setTimeout(() => { void flush() }, 800)
      return true
    },
    dispose() {
      disposed = true
      clearTimeout(timer)
      activationWaits.forEach(controller => controller.abort())
      activationWaits.clear()
      seen.clear()
    }
  }
}

let registration: Promise<ServiceWorkerRegistration | undefined> | undefined

export function registerPwa() {
  if (!isSecureContext || !('serviceWorker' in navigator)) return Promise.resolve(undefined)
  registration ??= navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
    registration = undefined
    return undefined
  })
  return registration
}
