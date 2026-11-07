import { MAX_UPLOAD_FILES, MAX_UPLOAD_FILE_SIZE } from '#src/constant'
import { UserError, resp } from '#src/utils'
import type { NextFunction, Request, Response } from 'express'

const MULTER_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: `单个文件不能超过 ${Math.round(MAX_UPLOAD_FILE_SIZE / 1024 / 1024)}MB`,
  LIMIT_FILE_COUNT: `单次最多上传 ${MAX_UPLOAD_FILES} 个文件`,
  ENAMETOOLONG: '文件名过长'
}

/**
 * JSON error responses for middleware failures (uploads in particular). Messages of
 * Node system errors (ENOENT, EACCES, ...) can contain server paths and are not exposed.
 */
export function errorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err)

  const code = typeof err?.code === 'string' ? err.code : undefined
  const mapped = code ? MULTER_MESSAGES[code] : undefined
  const isSystemError = !!code && /^(E[A-Z]+|ERR_[A-Z_]+)$/.test(code)
  const status = err instanceof UserError ? err.status : mapped ? 400 : isSystemError ? 500 : 400
  const message: string = mapped ?? (status >= 500 ? '服务器处理失败' : err?.message || '请求处理失败')
  if (status >= 500) console.error(err)
  else console.warn(err?.message ?? err)

  res
    .status(status)
    .type('application/json')
    .end(resp({ code: status, status: 'Fail', message, data: code ? { code } : undefined }))
}
