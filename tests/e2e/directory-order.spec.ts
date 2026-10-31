import { expect, test } from '@playwright/test'

test('renders newest-first date directories before ordinary names and opens the newest folder', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const labels = ['2026-10-31', '2024-01-01', '1970-01-01', 'alpha', 'zeta']
  await page.route('**/__test_api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const data = path.endsWith('/directory-tree') ? {
      key: 'root', label: 'files', isFile: false,
      children: labels.map(label => ({
        key: label, label, isFile: false,
        children: [{ key: `${label}-file`, label: `${label}-contents.txt`, isFile: true, size: 11 }]
      }))
    } : { isAdmin: false }
    await route.fulfill({ json: { status: 'Success', data } })
  })
  await page.goto('/')

  await expect(page.locator('.file-tree .file-label span')).toHaveText([
    '2026-10-31', '2026-10-31-contents.txt', '2024-01-01', '1970-01-01', 'alpha', 'zeta'
  ])
  await expect(page.getByText('2026-10-31-contents.txt', { exact: true })).toBeVisible()
  for (const label of labels.slice(1)) {
    await expect(page.getByText(`${label}-contents.txt`, { exact: true })).not.toBeVisible()
  }
  expect(errors).toEqual([])
})
