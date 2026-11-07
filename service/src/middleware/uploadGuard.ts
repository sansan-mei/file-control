import { MAX_UPLOAD_REQUEST_BYTES } from '#src/constant'
import { UserError } from '#src/utils'
import { INVALID_FILE_PASSWORD_MESSAGE, isValidFilePassword } from '#src/utils/storedName'
import { assertStorageAvailable, getUploadTokenFromRequest } from '#src/utils/uploadQuota'
import type { NextFunction, Request, Response } from 'express'

/**
 * Checks everything known from headers before multer starts writing to disk:
 * password format, request size and the storage limit (previously only `/check-memory`
 * enforced it, and only for clients that chose to call it).
 */
export function uploadGuard(req: Request, res: Response, next: NextFunction) {
  try {
    const isPublic = +req.cookies?.isPublic
    if (!isPublic && !isValidFilePassword(req.cookies?.filePwd ?? '')) {
      throw new UserError(INVALID_FILE_PASSWORD_MESSAGE)
    }

    const rawLength = req.headers['content-length']
    const length = Number(rawLength)
    if (!rawLength || !Number.isFinite(length) || length < 0) throw new UserError('缺少上传大小', 411)
    if (length > MAX_UPLOAD_REQUEST_BYTES) {
      // Do not drain an oversized body just to answer it.
      res.setHeader('Connection', 'close')
      throw new UserError('上传内容过大', 413)
    }

    assertStorageAvailable(length, getUploadTokenFromRequest(req))
    next()
  } catch (error) {
    next(error)
  }
}
