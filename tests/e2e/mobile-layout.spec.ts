import { expect, test, type Page } from '@playwright/test'

const browserErrors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
})
test.afterEach(({ page }) => {
  expect(browserErrors.get(page)).toEqual([])
})

async function openFiles(page: Page, admin = false) {
  await page.route('**/__test_api/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = {}
    if (path.endsWith('/admin-status')) data = { isAdmin: admin }
    if (path.endsWith('/directory-tree')) data = { children: [{
      key: 'documents', label: '项目资料', children: Array.from({ length: 30 }, (_, i) => ({
        key: `document-${i}`, label: i === 0 ? '移动端界面设计评审与非常长的文件名称.pdf' : `项目文档-${i}.pdf`, isFile: true, size: 1024
      }))
    }] }
    if (path.endsWith('/check-memory')) data = { uploadToken: 'fixture-only' }
    await route.fulfill({ json: { status: 'Success', data } })
  })
  await page.goto('/')
  await expect(page.getByText('项目资料', { exact: true })).toBeVisible()
}

for (const [width, height] of [[320, 568], [360, 640], [390, 844], [430, 932], [767, 1024]]) {
  test(`mobile ${width}x${height}: file browser uses at least 80% of the viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await openFiles(page, true)
    const metrics = await page.locator('.file-scrollbar').evaluate(el => {
      const rect = el.getBoundingClientRect()
      return {
        visibleRatio: Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0)) / innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth,
        bodyOverflow: document.documentElement.scrollHeight > innerHeight,
        top: rect.top,
        browserHeight: rect.height
      }
    })
    console.log(JSON.stringify({ width, height, ...metrics }))
    await page.screenshot({ path: test.info().outputPath('files.png'), animations: 'disabled' })
    expect(metrics.visibleRatio).toBeGreaterThanOrEqual(0.8)
    expect(metrics.overflow).toBe(false)
    expect(metrics.bodyOverflow).toBe(false)
  })
}

test('mobile search and secondary actions use dismissible bottom drawers', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openFiles(page)
  await page.getByRole('button', { name: '搜索文件', exact: true }).click()
  const tools = page.locator('.mobile-tools-drawer')
  await expect(tools).toBeVisible()
  await tools.getByRole('textbox', { name: '搜索文件或文件夹' }).fill('项目文档-9')
  await page.screenshot({ path: test.info().outputPath('search.png'), animations: 'disabled' })
  await tools.getByRole('button', { name: '查看文件' }).click()
  await expect(page.getByText('项目文档-9.pdf', { exact: true })).toBeVisible()
  await expect(page.getByText('项目文档-8.pdf', { exact: true })).not.toBeVisible()
  await page.getByRole('button', { name: '更多文件操作' }).click()

  await tools.getByRole('button', { name: '空间设置', exact: true }).click()
  const settings = page.locator('.settings-drawer')
  await expect(settings.getByLabel('文件密码', { exact: true })).toBeEnabled()
  const box = await settings.boundingBox()
  expect(box!.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: test.info().outputPath('settings.png'), animations: 'disabled' })
  await settings.getByRole('button', { name: '完成设置' }).click()
  await expect(settings).not.toBeVisible()
  await page.getByRole('button', { name: '更多文件操作' }).click()
  const refreshed = page.waitForRequest('**/__test_api/directory-tree')
  await tools.getByRole('button', { name: '刷新文件', exact: true }).click()
  await refreshed
  await expect(tools).not.toBeVisible()
})

test('mobile uploads stay out of the file list and their completed records expire', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openFiles(page)
  await page.clock.install()
  let finishUpload!: () => void
  const pending = new Promise<void>(resolve => { finishUpload = resolve })
  await page.route('**/__test_api/upload-file', async route => {
    await pending
    await route.fulfill({ json: { status: 'Success', data: 'saved' } })
  })
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '上传文件', exact: true }).click()
  await (await chooser).setFiles({ name: 'upload-fixture.txt', mimeType: 'text/plain', buffer: Buffer.from('browser test fixture') })
  await expect(page.locator('.task-count')).toHaveText('1')
  await expect(page.locator('.file-panel .upload-progress-panel')).toHaveCount(0)
  const heightBefore = await page.locator('.file-scrollbar').evaluate(el => el.clientHeight)
  await page.getByRole('button', { name: '更多文件操作' }).click()
  await page.getByRole('button', { name: '传输记录 (1)', exact: true }).click()
  const transfers = page.locator('.transfers-drawer')
  await expect(transfers.getByText('upload-fixture.txt', { exact: true })).toBeVisible()
  await expect(transfers.getByRole('button', { name: '移除 upload-fixture.txt 的上传记录' })).toHaveCount(0)
  await expect(page.locator('.mobile-tools-drawer')).not.toBeVisible()
  await page.screenshot({ path: test.info().outputPath('transfers.png'), animations: 'disabled' })
  await transfers.getByRole('button', { name: '返回文件' }).click()
  expect(await page.locator('.file-scrollbar').evaluate(el => el.clientHeight)).toBe(heightBefore)
  await page.clock.fastForward(60000)
  await expect(page.locator('.task-count')).toHaveText('1')
  finishUpload()
  await page.getByRole('button', { name: '更多文件操作' }).click()
  await page.getByRole('button', { name: '传输记录 (1)', exact: true }).click()
  await expect(transfers.locator('.upload-success')).toBeVisible()
  await page.clock.fastForward(5000)
  await expect(page.locator('.task-count')).toHaveCount(0)
  await expect(transfers).not.toBeVisible()
})

test('mobile batch deletion stays available to admins through the actions sheet', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await openFiles(page, true)
  await page.getByRole('checkbox').nth(1).click()
  await page.getByRole('button', { name: '更多文件操作' }).click()
  page.once('dialog', dialog => dialog.accept())
  const deleted = page.waitForRequest(request => new URL(request.url()).pathname === '/__test_api/delete-files')
  await page.getByRole('button', { name: '批量删除 (1)', exact: true }).click()
  expect((await deleted).url()).toContain('hashes=document-0')
  await expect(page.locator('.mobile-tools-drawer')).not.toBeVisible()
})

for (const width of [768, 1440]) {
  test(`desktop ${width}: search, uploader and settings remain usable`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openFiles(page, true)
    await expect(page.locator('header').getByRole('textbox', { name: '搜索文件或文件夹' })).toBeVisible()
    await expect(page.getByRole('button', { name: '点击/拖放文件上传', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '更多文件操作' })).toHaveCount(0)
    await page.getByRole('button', { name: '空间设置', exact: true }).click()
    const settings = page.locator('.settings-drawer')
    await expect(settings).toBeVisible()
    const box = await settings.boundingBox()
    expect(box!.width).toBeCloseTo(440, 1)
    expect(box!.height).toBeCloseTo(900, 1)
    await settings.getByRole('button', { name: '完成设置' }).click()
    await expect(settings).not.toBeVisible()
    await page.screenshot({ path: test.info().outputPath('desktop.png'), animations: 'disabled' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })
}
