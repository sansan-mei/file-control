import { Buffer } from 'node:buffer'
import { expect, test, type Page } from '@playwright/test'

async function openFixture(page: Page) {
  await page.route('**/__test_api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const data = path.endsWith('/directory-tree') ? { children: [] } : path.endsWith('/admin-status') ? { isAdmin: false } : { uploadToken: 'fixture-only' }
    await route.fulfill({ json: { status: 'Success', data } })
  })
  await page.goto('/')
  await expect(page.getByText('暂无文件', { exact: true })).toBeVisible()
}
for (const [width, height] of [[320, 568], [360, 640], [390, 844], [430, 932], [767, 1024], [768, 900], [1440, 900]]) {
  test(`PWA settings ${width}x${height}: install guidance and notification controls remain reachable`, async ({ page, context }) => {
    await context.grantPermissions(['notifications'])
    await page.setViewportSize({ width, height })
    await openFixture(page)
    if (width < 768) await page.getByRole('button', { name: '更多文件操作' }).click()
    await page.getByRole('button', { name: '空间设置', exact: true }).click()
    const appSettings = page.getByRole('region', { name: '应用与通知' })
    await expect(appSettings).toContainText('添加到主屏幕')
    await page.getByTestId('enable-notifications').click()
    await expect(page.getByTestId('disable-notifications')).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('pwa-settings.png'), animations: 'disabled' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await page.getByRole('button', { name: '完成设置' }).click()
    await expect(page.locator('.settings-drawer')).not.toBeVisible()
  })
}

async function ready(page: Page) {
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 10000 }).toBe(true)
}

test('real service worker serves only a generic offline page and never caches private responses', async ({ page, context }) => {
  await openFixture(page)
  await ready(page)
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href)).json())
  expect(manifest).toMatchObject({ id: '/', scope: '/', start_url: '/', display: 'standalone' })
  await page.route('**/api/check-file/**', route => route.fulfill({ body: 'PRIVATE-FIXTURE-NEVER-CACHE', contentType: 'text/plain' }))
  await page.evaluate(async () => {
    await fetch('/__test_api/directory-tree')
    await fetch('/api/check-file/hash/private.txt?password=fixture')
  })
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(req => new URL(req.url).pathname)))).flat())
  expect(cached.sort()).toEqual(['/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/offline.html'].sort())
  await context.setOffline(true)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '当前离线' })).toBeVisible()
  await expect(page.getByText('PRIVATE-FIXTURE-NEVER-CACHE')).toHaveCount(0)
})

test('settings install UX captures a prompt before the drawer opens and reports installed status', async ({ page }) => {
  await openFixture(page)
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(event, { prompt: async () => { (window as any).__prompted = true }, userChoice: Promise.resolve({ outcome: 'accepted' }) })
    window.dispatchEvent(event)
  })
  await page.getByRole('button', { name: '空间设置', exact: true }).click()
  await page.getByTestId('install-app').click()
  expect(await page.evaluate(() => (window as any).__prompted)).toBe(true)
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
  await expect(page.getByText('已添加到桌面', { exact: true })).toBeVisible()
  await expect(page.getByTestId('install-app')).toHaveCount(0)
})

test('background upload results generate real SW notifications; focused uploads only toast', async ({ page, context }) => {
  await context.grantPermissions(['notifications'])
  await openFixture(page)
  await ready(page)
  await page.getByRole('button', { name: '空间设置', exact: true }).click()
  await page.getByTestId('enable-notifications').click()
  await expect(page.getByTestId('disable-notifications')).toBeVisible()
  await page.getByRole('button', { name: '完成设置' }).click()
  await expect(page.locator('.settings-drawer')).not.toBeVisible()
  const notices = () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => ({ body: n.body, tag: n.tag })))
  const closeNotices = () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).forEach(n => n.close()))
  await page.bringToFront()
  await page.getByLabel('选择上传文件', { exact: true }).setInputFiles({ name: 'foreground.txt', mimeType: 'text/plain', buffer: Buffer.from('fixture') })
  await expect(page.getByText('文件 foreground.txt 上传成功', { exact: true })).toBeVisible()
  await page.waitForTimeout(900)
  expect(await notices()).toEqual([])
  let finish!: () => void
  const pending = new Promise<void>(resolve => finish = resolve)
  let count = 0
  await page.route('**/__test_api/upload-file', async route => {
    const index = count++
    await pending
    await route.fulfill({ json: index === 0 ? { status: 'Success', data: 'saved' } : { status: 'Error', message: 'fixture failure' } })
  })
  await page.getByLabel('选择上传文件', { exact: true }).setInputFiles(['ok', 'fail'].map(name => ({ name: `${name}.txt`, mimeType: 'text/plain', buffer: Buffer.from('fixture') })))
  await expect.poll(() => count).toBe(2)
  const background = await context.newPage()
  await background.goto('about:blank')
  await background.bringToFront()
  // Playwright normally forces each page focused, even when another tab is front.
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false })
  expect(await page.evaluate(() => document.hasFocus())).toBe(false)
  finish()
  await expect.poll(notices).toEqual([{ body: '上传成功 1 项，失败 1 项。打开应用查看传输记录。', tag: 'file-control-transfers' }])
  await closeNotices()
  await background.close()
})
