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

  it.each([
    [200, { status: 'Error', message: 'quota exceeded' }, 'quota exceeded'],
    [201, { status: 'Success' }, '201'],
    [500, { message: 'server unavailable' }, 'Request failed with status code 500']
  ])('preserves rejection behavior for HTTP %s', async (status, payload, message) => {
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(function (this: XMLHttpRequest) {
      Object.defineProperties(this, { status: { value: status }, responseText: { value: JSON.stringify(payload) }, readyState: { value: 4 } })
      this.dispatchEvent(new ProgressEvent('loadend'))
    })
    try { await expect(uploadFile(new FormData())).rejects.toMatchObject({ message }) }
    finally { xhr.mockRestore() }
  })
})
