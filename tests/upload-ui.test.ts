import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowMount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import FilePage from '../src/components/filePage.vue'
import { NButton, NDrawer, NInput, NTree, NUpload } from 'naive-ui'
import { uploadFile, fetchDirectorySize, fetchDirectoryTree } from '../src/api'

vi.mock('../src/api', () => ({ uploadFile: vi.fn(), fetchDirectorySize: vi.fn(), fetchDirectoryTree: vi.fn(), fetchAdminStatus: vi.fn(async () => ({ data: { isAdmin: false } })), deleteFile: vi.fn(), deleteFiles: vi.fn() }))
vi.mock('naive-ui', async (original) => ({ ...await original<typeof import('naive-ui')>(), useMessage: () => ({ success: vi.fn(), error: vi.fn() }), useLoadingBar: () => ({ start: vi.fn(), finish: vi.fn(), error: vi.fn() }) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchDirectorySize).mockResolvedValue({ status: 'Success', data: { uploadToken: 'token' } } as never)
  vi.mocked(fetchDirectoryTree).mockResolvedValue({ status: 'Success', data: { children: [] } } as never)
})

afterEach(() => vi.unstubAllGlobals())
enableAutoUnmount(afterEach)
function setup() { return shallowMount(FilePage, { global: { renderStubDefaultSlot: true } }) }
function pick(wrapper: ReturnType<typeof setup>, name = 'a.txt') {
  const file = new File(['hello'], name)
  const hook = wrapper.findComponent(NUpload).props('onBeforeUpload')
  return hook({ file: { id: name, file }, fileList: [] })
}

describe('file manager shell', () => {
  it('keeps the upload picker keyboard accessible with a native button', () => {
    const wrapper = setup()
    expect(wrapper.find('.workspace-sidebar button.upload-cta').exists()).toBe(false)
    expect(wrapper.find('main button.upload-cta').text()).toBe('点击/拖放文件上传')
    expect(wrapper.find('button.upload-cta').exists()).toBe(true)
    expect(wrapper.find('button.upload-cta').attributes('type')).toBe('button')
    expect(wrapper.find('input[type="file"][multiple]').exists()).toBe(true)
    const picker = wrapper.find('input[type="file"]').element as HTMLInputElement
    const click = vi.spyOn(picker, 'click')
    wrapper.find('button.upload-cta').element.click()
    expect(click).toHaveBeenCalledOnce()
  })
  it('uploads every file from the native picker and allows selecting the same file again', async () => {
    vi.mocked(uploadFile).mockResolvedValue({ status: 'Success' } as never)
    const wrapper = setup()
    await flushPromises()
    const input = wrapper.find('input[type="file"]')
    const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')]
    Object.defineProperty(input.element, 'files', { configurable: true, value: files })
    await input.trigger('change')
    await flushPromises()
    expect(uploadFile).toHaveBeenCalledTimes(2)
    expect(vi.mocked(uploadFile).mock.calls.map(([body]) => (body.get('file') as File).name)).toEqual(['a.txt', 'b.txt'])
    expect((input.element as HTMLInputElement).value).toBe('')
    await input.trigger('change')
    await flushPromises()
    expect(uploadFile).toHaveBeenCalledTimes(4)
  })

  it('retains multi-file directory drag uploads through the same real upload handler', async () => {
    vi.mocked(uploadFile).mockResolvedValue({ status: 'Success' } as never)
    const wrapper = setup()
    const uploader = wrapper.findComponent(NUpload)
    expect(uploader.props('multiple')).toBe(true)
    expect(uploader.props('directoryDnd')).toBe(true)
    expect(uploader.props('defaultUpload')).toBe(false)
    await pick(wrapper, 'dropped.txt')
    await flushPromises()
    expect((vi.mocked(uploadFile).mock.calls[0][0].get('file') as File).name).toBe('dropped.txt')
  })

  it('exposes Chinese landmarks, responsive navigation, and the refresh action', async () => {
    const wrapper = setup()
    await flushPromises()
    expect(wrapper.find('header .brand').text()).toBe('文件')
    expect(wrapper.find('h1').text()).toBe('我的文件')
    expect(wrapper.find('header').findComponent(NInput).attributes('aria-label')).toBe('搜索文件或文件夹')
    expect(wrapper.find('.upload-panel').exists()).toBe(false)
    expect(wrapper.find('nav[aria-label="主导航"]').exists()).toBe(true)
    expect(wrapper.find('main').classes()).toContain('workspace-main')
    expect(wrapper.find('.workspace-sidebar').exists()).toBe(true)
    expect(wrapper.find('section[aria-label="文件列表"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('暂无文件')
    const refresh = wrapper.findAllComponents(NButton).find(button => button.text().includes('刷新'))!
    refresh.vm.$emit('click')
    await flushPromises()
    expect(fetchDirectoryTree).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('opens the settings drawer from the responsive navigation', async () => {
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => { callback(); return 1 })
    const wrapper = setup()
    await wrapper.find('nav button').trigger('click')
    expect(wrapper.findComponent(NDrawer).props('show')).toBe(true)
    expect(wrapper.findComponent(NDrawer).classes()).toContain('settings-drawer')
  })

  it('keeps search wired to the file tree and guest batch actions hidden', async () => {
    vi.mocked(fetchDirectoryTree).mockResolvedValue({ data: { children: [{ key: 'doc', label: '文档.txt', isFile: true }] } } as never)
    const wrapper = setup()
    await flushPromises()
    expect(wrapper.text()).not.toContain('批量删除')
    const search = wrapper.findAllComponents(NInput).find(input => input.attributes('aria-label') === '搜索文件或文件夹')!
    search.vm.$emit('update:value', '文档')
    await flushPromises()
    expect(wrapper.findComponent(NTree).props('pattern')).toBe('文档')
    expect(wrapper.findComponent(NTree).props('checkable')).toBe(false)
  })
})

 describe('upload UI', () => {
  it('shows byte progress, waits for the server at 100%, then refreshes without timers', async () => {
    let finish!: (value: unknown) => void
    vi.mocked(uploadFile).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const wrapper = setup()
    await flushPromises()
    const pending = pick(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('a.txt')
    const callback = vi.mocked(uploadFile).mock.calls[0][1]!
    callback({ loaded: 2, total: 5 } as never)
    await flushPromises()
    expect(wrapper.text()).toContain('40%')
    callback({ loaded: 5, total: 5, lengthComputable: true } as never)
    await flushPromises()
    expect(wrapper.text()).toContain('服务器处理中')
    expect(wrapper.text()).not.toContain('上传成功')
    expect(fetchDirectoryTree).toHaveBeenCalledTimes(1)
    const body = vi.mocked(uploadFile).mock.calls[0][0]
    expect(body.get('uploadToken')).toBe('token')
    finish({ status: 'Success' })
    expect(await pending).toBe(false)
    await flushPromises()
    expect(wrapper.text()).toContain('上传成功')
    expect(fetchDirectoryTree).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('keeps simultaneous same-name uploads independent and unknown totals indeterminate on failure', async () => {
    const rejectors: Array<(reason: unknown) => void> = []
    vi.mocked(uploadFile).mockImplementation(() => new Promise((_, reject) => rejectors.push(reject)))
    const wrapper = setup()
    await flushPromises()
    const first = pick(wrapper, 'duplicate.txt')
    const second = pick(wrapper, 'duplicate.txt')
    await flushPromises()
    vi.mocked(uploadFile).mock.calls[0][1]!({ loaded: 2, total: 5 })
    vi.mocked(uploadFile).mock.calls[1][1]!({ loaded: 3 })
    await flushPromises()
    const entries = wrapper.findAll('.upload-entry')
    expect(entries[0].text()).toContain('40%')
    expect(entries[1].text()).toContain('总大小未知')
    expect(entries[1].find('progress').attributes('value')).toBeUndefined()
    rejectors[0](new Error('server rejected'))
    await first
    await flushPromises()
    expect(entries[0].text()).toContain('上传失败：server rejected')
    expect(entries[1].text()).toContain('总大小未知')
    expect(fetchDirectoryTree).toHaveBeenCalledTimes(1)
    rejectors[1](new Error('network failed'))
    await second
    wrapper.unmount()
  })

  it('shows preflight errors without starting the upload', async () => {
    vi.mocked(fetchDirectorySize).mockRejectedValue(new Error('quota exceeded'))
    const wrapper = setup()
    await flushPromises()
    await pick(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('上传失败：quota exceeded')
    expect(uploadFile).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('starts every clipboard image independently, including while picker uploads run', async () => {
    vi.mocked(uploadFile).mockImplementation(() => new Promise(() => {}))
    const wrapper = setup()
    await flushPromises()
    void pick(wrapper, 'same.png')
    const event = new Event('paste')
    Object.defineProperty(event, 'clipboardData', { value: { items: [1, 2].map(() => ({ type: 'image/png', getAsFile: () => new File(['image'], 'image.png', { type: 'image/png' }) })) } })
    document.dispatchEvent(event)
    await flushPromises()
    expect(uploadFile).toHaveBeenCalledTimes(3)
    expect(wrapper.findAll('.upload-entry')).toHaveLength(3)
    wrapper.unmount()
  })
})
