import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import FilePage from '../src/components/filePage.vue'
import { NUpload } from 'naive-ui'
import { uploadFile, fetchDirectorySize, fetchDirectoryTree } from '../src/api'

vi.mock('../src/api', () => ({ uploadFile: vi.fn(), fetchDirectorySize: vi.fn(), fetchDirectoryTree: vi.fn(), fetchAdminStatus: vi.fn(async () => ({ data: { isAdmin: false } })), deleteFile: vi.fn(), deleteFiles: vi.fn() }))
vi.mock('naive-ui', async (original) => ({ ...await original<typeof import('naive-ui')>(), useMessage: () => ({ success: vi.fn(), error: vi.fn() }), useLoadingBar: () => ({ start: vi.fn(), finish: vi.fn(), error: vi.fn() }) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchDirectorySize).mockResolvedValue({ status: 'Success', data: { uploadToken: 'token' } } as never)
  vi.mocked(fetchDirectoryTree).mockResolvedValue({ status: 'Success', data: { children: [] } } as never)
})

function setup() { return shallowMount(FilePage, { global: { renderStubDefaultSlot: true } }) }
function pick(wrapper: ReturnType<typeof setup>, name = 'a.txt') {
  const file = new File(['hello'], name)
  const hook = wrapper.findComponent(NUpload).props('onBeforeUpload')
  return hook({ file: { id: name, file }, fileList: [] })
}

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
