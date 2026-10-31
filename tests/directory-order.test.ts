import { afterEach, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { NMessageProvider } from 'naive-ui'
import { h } from 'vue'
import FilePage from '../src/components/filePage.vue'
import { fetchDirectoryTree } from '../src/api'

vi.mock('../src/api', () => ({
  fetchDirectoryTree: vi.fn(),
  fetchAdminStatus: vi.fn(async () => ({ data: { isAdmin: false } })),
  fetchDirectorySize: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  deleteFiles: vi.fn()
}))

enableAutoUnmount(afterEach)

it('renders backend newest-first directory order and expands only the newest folder by default', async () => {
  // The backend places valid dates (including epoch zero) before stable ordinary names.
  const labels = ['2026-10-31', '2024-01-01', '1970-01-01', 'alpha', 'zeta']
  vi.mocked(fetchDirectoryTree).mockResolvedValueOnce({
    status: 'Success',
    data: {
      key: 'root', label: 'files', isFile: false,
      children: labels.map(label => ({
        key: label, label, isFile: false,
        children: [{ key: `${label}-file`, label: `${label}-contents.txt`, isFile: true, size: 11 }]
      }))
    }
  } as never)
  const wrapper = mount(NMessageProvider, { slots: { default: () => h(FilePage) } })
  await flushPromises()

  // Assert the real NTree DOM, not props or implementation source.
  expect(wrapper.findAll('.file-tree .file-label span').map(node => node.text())).toEqual([
    '2026-10-31', '2026-10-31-contents.txt', '2024-01-01', '1970-01-01', 'alpha', 'zeta'
  ])
})
