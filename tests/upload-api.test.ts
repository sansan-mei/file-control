import { describe, it, expect, vi } from 'vitest'
import { uploadFile } from '../src/api'

describe('upload transport', () => {
  it('forwards byte progress on the existing credentialed Axios instance', async () => {
    const callback = vi.fn()
    const body = new FormData()
    body.append('file', new File(['hello'], 'hello.txt'))
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(function (this: XMLHttpRequest, sentBody) {
      expect(this.withCredentials).toBe(true)
      expect(sentBody).toBe(body)
      this.upload.dispatchEvent(new ProgressEvent('progress', { loaded: 3, total: 5, lengthComputable: true }))
      Object.defineProperties(this, { status: { value: 200 }, responseText: { value: JSON.stringify({ status: 'Success', data: 'saved' }) }, readyState: { value: 4 } })
      this.dispatchEvent(new ProgressEvent('loadend'))
    })
    try {
      const result = await uploadFile(body, callback)
      expect(result).toEqual({ status: 'Success', data: 'saved' })
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ loaded: 3, total: 5 }))
    } finally { xhr.mockRestore() }
  })

  it('sends the capacity reservation token as a header only when one was issued', async () => {
    const headers = vi.spyOn(XMLHttpRequest.prototype, 'setRequestHeader')
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(function (this: XMLHttpRequest) {
      Object.defineProperties(this, { status: { value: 200 }, responseText: { value: JSON.stringify({ status: 'Success' }) }, readyState: { value: 4 } })
      this.dispatchEvent(new ProgressEvent('loadend'))
    })
    try {
      await uploadFile(new FormData(), undefined, 'token-123')
      expect(headers).toHaveBeenCalledWith('X-Upload-Token', 'token-123')
      headers.mockClear()
      await uploadFile(new FormData(), undefined, null)
      expect(headers.mock.calls.some(([name]) => /x-upload-token/i.test(name))).toBe(false)
    } finally {
      xhr.mockRestore()
      headers.mockRestore()
    }
  })

  it.each([
    [200, { status: 'Error', message: 'quota exceeded' }, 'quota exceeded'],
    [201, { status: 'Success' }, '201'],
    // Server-side upload rejections surface their JSON message instead of the Axios status text.
    [400, { status: 'Fail', message: '占用超出上限' }, '占用超出上限'],
    [500, { message: 'server unavailable' }, 'server unavailable'],
    [502, '<html>bad gateway</html>', 'Request failed with status code 502']
  ])('rejection message for HTTP %s', async (status, payload, message) => {
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(function (this: XMLHttpRequest) {
      Object.defineProperties(this, { status: { value: status }, responseText: { value: JSON.stringify(payload) }, readyState: { value: 4 } })
      this.dispatchEvent(new ProgressEvent('loadend'))
    })
    try { await expect(uploadFile(new FormData())).rejects.toMatchObject({ message }) }
    finally { xhr.mockRestore() }
  })
})
