import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { NDropdown, NInput, NMessageProvider, NModal } from 'naive-ui'
import { h } from 'vue'
import FilePage from '../src/components/filePage.vue'
import { deleteFile, fetchAdminStatus, fetchDirectoryTree } from '../src/api'

vi.mock('../src/api', () => ({
  fetchDirectoryTree: vi.fn(),
  fetchAdminStatus: vi.fn(),
  fetchDirectorySize: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(async () => ({ status: 'Success' })),
  deleteFiles: vi.fn()
}))

const uploadedAt = new Date(2026, 10, 7, 9, 5).getTime()
const tree = {
  key: 'root', label: 'files', isFile: false,
  children: [{
    key: 'day', label: '2026-11-7', isFile: false,
    children: [
      { key: 'public', label: 'photo.png', isFile: true, size: 2048, locked: false, uploadedAt },
      { key: 'secret', label: 'secret.pdf', isFile: true, size: 10, locked: true, uploadedAt }
    ]
  }]
}

function clearCookies() {
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0].trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  clearCookies()
  vi.mocked(fetchDirectoryTree).mockResolvedValue({ status: 'Success', data: tree } as never)
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => { callback(); return 1 })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})
enableAutoUnmount(afterEach)

async function setup(isAdmin = false) {
  vi.mocked(fetchAdminStatus).mockResolvedValue({ data: { isAdmin } } as never)
  const wrapper = mount(NMessageProvider, { slots: { default: () => h(FilePage) }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

function dropdownFor(wrapper: Awaited<ReturnType<typeof setup>>, label: string) {
  return wrapper.findAllComponents(NDropdown).find(dropdown => dropdown.find(`[aria-label="${label} 的更多操作"]`).exists())!
}

const optionKeys = (dropdown: ReturnType<typeof dropdownFor>) =>
  (dropdown.props('options') as Array<{ key: string }>).map(option => option.key)

describe('file rows', () => {
  it('shows type, lock, size and upload time without enabling a setting first', async () => {
    const wrapper = await setup()
    const rows = wrapper.findAll('.file-row.is-file')
    expect(rows.map(row => row.find('.file-name').text())).toEqual(['photo.png', 'secret.pdf'])
    expect(rows[0].find('.file-meta').text()).toBe('2.00KB09:05')
    expect(rows[1].find('.file-lock').text()).toBe('需密码')
    expect(wrapper.find('.file-kind-image').exists()).toBe(true)
    expect(wrapper.find('.file-kind-pdf').exists()).toBe(true)
    // Folder names are already dates: only the count is shown, no repeated date.
    expect(wrapper.find('.file-row.is-folder .file-meta').text()).toBe('2 个文件')
    expect(rows[0].find('.file-meta-size').text()).toBe('2.00KB')
    expect(rows[0].find('.file-meta-time').text()).toBe('09:05')
  })

  it('offers delete only where the server would allow it and confirms before deleting', async () => {
    const guest = await setup(false)
    expect(optionKeys(dropdownFor(guest, 'photo.png'))).not.toContain('delete')
    expect(optionKeys(dropdownFor(guest, 'secret.pdf'))).toContain('delete')
    guest.unmount()

    const admin = await setup(true)
    const dropdown = dropdownFor(admin, 'photo.png')
    expect(optionKeys(dropdown)).toEqual(['open', 'download', 'copy', 'divider', 'delete'])
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    dropdown.vm.$emit('select', 'delete')
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith('确认删除「photo.png」？删除后无法恢复。')
    expect(deleteFile).not.toHaveBeenCalled()
    dropdown.vm.$emit('select', 'delete')
    await flushPromises()
    expect(deleteFile).toHaveBeenCalledWith('public')
  })

  it('asks for the password of a locked file instead of opening a 403 page', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const wrapper = await setup(false)
    await wrapper.findAll('.n-tree-node').find(node => node.text().includes('secret.pdf'))!.trigger('click')
    await flushPromises()
    const modal = wrapper.findComponent(NModal)
    expect(modal.props('show')).toBe(true)
    expect(open).not.toHaveBeenCalled()
    modal.findAllComponents(NInput).find(input => input.attributes('aria-label') === '打开文件的密码')!.vm.$emit('update:value', 'p#1')
    await flushPromises()
    document.querySelector<HTMLFormElement>('.password-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()
    expect(open).toHaveBeenCalledWith('/api/check-file/secret/secret.pdf/p%231')
    expect(wrapper.findComponent(NModal).props('show')).toBe(false)
  })

  it('opens public files directly and offers a password link only when one is set', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const wrapper = await setup(false)
    await wrapper.findAll('.n-tree-node').find(node => node.text().includes('photo.png'))!.trigger('click')
    expect(open).toHaveBeenCalledWith('/api/check-file/public/photo.png')
    expect(optionKeys(dropdownFor(wrapper, 'secret.pdf'))).not.toContain('copy-password')
    wrapper.unmount()
    document.cookie = 'filePwd=pw; path=/'
    const withPassword = await setup(false)
    expect(optionKeys(dropdownFor(withPassword, 'secret.pdf'))).toContain('copy-password')
  })

  it('explains an empty search and clears it in one click', async () => {
    const wrapper = await setup()
    const search = wrapper.findAllComponents(NInput).find(input => input.attributes('aria-label') === '搜索文件或文件夹')!
    search.vm.$emit('update:value', 'nothing-matches')
    await flushPromises()
    expect(wrapper.text()).toContain('没有找到相关文件')
    await wrapper.find('.clear-search').trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('没有找到相关文件')
  })
})
