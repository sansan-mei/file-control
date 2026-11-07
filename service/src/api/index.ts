import { ADMIN, NOT_SHOW_PASS, expireTime, getStorageRoot } from '#src/constant'
import { uploadGuard } from '#src/middleware/uploadGuard'
import { uploadInstance } from '#src/middleware/uploadInstance'
import { client } from '#src/redis'
import { $api, FileApi, UserError, catchError, getDirectoryTree } from '#src/utils'
import { parseStoredName } from '#src/utils/storedName'
import {
  assertStorageAvailable,
  getUploadTokenFromRequest,
  releaseUploadReservation,
  reserveUpload
} from '#src/utils/uploadQuota'
import { createReadStream, statSync } from 'fs'
import { unlink } from 'fs/promises'
import mime from 'mime'
import { basename } from 'path'
import { nextTick } from 'process'

function parseHashList(value: unknown) {
  const rawValue = Array.isArray(value) ? value.join(',') : value
  if (typeof rawValue !== 'string') return []
  return rawValue
    .split(',')
    .map((hash) => hash.trim())
    .filter(Boolean)
}

function isAdminToken(admin: string | null, token: unknown) {
  return !!admin && token === admin
}

/** Media a browser can show inline without running scripts; everything else is sandboxed. */
function isPassiveMediaType(type: string) {
  return (
    (type.startsWith('image/') && type !== 'image/svg+xml') ||
    type.startsWith('video/') ||
    type.startsWith('audio/') ||
    type === 'application/pdf'
  )
}

function withCharset(type: string) {
  return /^text\/|json|xml|javascript/.test(type) ? `${type}; charset=utf-8` : type
}

/** RFC 6266/5987 header with an ASCII fallback, so non-ASCII names survive in every browser. */
function contentDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\%]/g, '_')
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  )
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

function matchesETag(header: string | undefined, hash: string) {
  if (!header) return false
  return header.split(',').some((tag) => {
    const value = tag.trim().replace(/^W\//, '').replace(/^"|"$/g, '')
    return value === hash || value === '*'
  })
}

/**
 * Single byte range (`bytes=a-b`, `bytes=a-`, `bytes=-n`). Syntactically invalid or
 * multi-range headers are ignored (full response), unsatisfiable ones yield 416.
 */
function parseRange(header: string | undefined, size: number) {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (!match[1] && !match[2])) return null

  const [, rawStart, rawEnd] = match
  let start: number
  let end: number
  if (!rawStart) {
    const suffix = Number(rawEnd)
    if (suffix === 0) return 'unsatisfiable' as const
    start = Math.max(size - suffix, 0)
    end = size - 1
  } else {
    start = Number(rawStart)
    if (rawEnd && Number(rawEnd) < start) return null
    end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1
  }
  if (start >= size) return 'unsatisfiable' as const
  return { start, end }
}

async function removeStoredFile(hash: string, path: string) {
  try {
    await unlink(path)
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.warn(error)
      throw new UserError('删除失败', 500)
    }
  }
  FileApi.removePath(hash)
}

$api.add([
  // /admin-status
  {
    path: '/admin-status',
    handler(req, res) {
      catchError(res, async () => {
        const { token } = req.cookies
        const admin = await client.get(ADMIN)
        return { data: { isAdmin: isAdminToken(admin, token) } }
      })
    }
  },
  // /directory-tree
  {
    path: '/directory-tree',
    handler(req, res) {
      catchError(res, async () => {
        const dirTree = getDirectoryTree(getStorageRoot())
        res.setHeader('Cache-Control', 'max-age=1') // 缓存响应
        return { data: dirTree }
      })
    }
  },
  // /check-file
  {
    path: '/check-file/:hash/:filename/:password?',
    async handler(req, res) {
      try {
        const { hash, filename } = req.params
        const path = FileApi.getPath(hash)
        const stat = statSync(path)
        if (!stat.isFile()) throw new UserError('文件不存在', 404)

        /** @description:验证文件密码是否跟提交的时候一致 */
        const { password } = parseStoredName(basename(path))
        const isProtected = password !== null && !path.includes(NOT_SHOW_PASS)
        if (isProtected) {
          const admin = await client.get(ADMIN)
          const filePwd = req.params.password || req.cookies.filePwd
          if (!isAdminToken(admin, req.cookies.token) && filePwd !== password) {
            res.setHeader('content-type', 'text/html; charset=utf-8')
            return res.status(403).end('密码错误')
          }
        }

        // Protected content must never be stored by shared caches (CDN / reverse proxy).
        res.setHeader('Cache-Control', `${isProtected ? 'private' : 'public'}, max-age=${expireTime}`)
        res.setHeader('ETag', `"${hash}"`)
        if (matchesETag(req.headers['if-none-match'], hash)) {
          res.status(304).end()
          return
        }

        const type = mime.getType(path)
        if (type) res.setHeader('Content-Type', withCharset(type))
        res.setHeader('X-Content-Type-Options', 'nosniff')
        // Uploaded HTML/SVG/etc. still renders, but without scripts and with an opaque origin.
        if (!type || !isPassiveMediaType(type)) res.setHeader('Content-Security-Policy', 'sandbox')
        res.setHeader('Accept-Ranges', 'bytes')
        if (filename) res.setHeader('Content-Disposition', contentDisposition(filename))

        const range = parseRange(req.headers.range, stat.size)
        if (range === 'unsatisfiable') {
          res.setHeader('Content-Range', `bytes */${stat.size}`)
          res.status(416).end()
          return
        }

        let readStream
        if (range) {
          res.status(206)
          res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`)
          res.setHeader('Content-Length', range.end - range.start + 1)
          readStream = createReadStream(path, range)
        } else {
          res.setHeader('Content-Length', stat.size) // 添加文件大小到响应头
          readStream = createReadStream(path)
        }
        readStream.on('error', (error) => {
          console.error(error)
          res.destroy(error)
        })
        readStream.pipe(res)
      } catch (error: any) {
        const notFound = (error instanceof UserError && error.status === 404) || error?.code === 'ENOENT'
        if (!notFound) console.error(error)
        res.status(notFound ? 404 : 400)
        res.setHeader('content-type', 'text/plain; charset=utf-8')
        res.end(notFound ? '文件不存在' : '状态异常')
      }
    }
  },
  // /upload-file post
  {
    method: 'post',
    path: '/upload-file',
    middleware: [uploadGuard, ...uploadInstance.any()],
    handler(req, res) {
      catchError(res, async () => {
        releaseUploadReservation(req.body?.uploadToken || getUploadTokenFromRequest(req))
        return { data: null, message: '上传成功' }
      })
    }
  },
  // /check-memory
  {
    path: '/check-memory',
    handler(req, res) {
      catchError(res, async () => {
        const size = Number(req.query.size)
        if (!Number.isFinite(size) || size < 0) throw new Error('文件大小异常')

        assertStorageAvailable(size)

        return {
          data: {
            uploadToken: reserveUpload(size)
          }
        }
      })
    }
  },
  // /delete-file
  {
    method: 'delete',
    path: '/delete-file',
    handler(req, res) {
      catchError(res, async () => {
        const hash = String(req.query.hash ?? '')
        const { token, filePwd } = req.cookies
        const path = FileApi.getPath(hash)
        const admin = await client.get(ADMIN)
        if (!isAdminToken(admin, token) && !path.includes(NOT_SHOW_PASS)) {
          const { password } = parseStoredName(basename(path))
          if (password === null) return { status: 'Fail', message: '公用文件只允许管理员删除' }
          if (filePwd !== password) return { status: 'Fail', message: '密码错误' }
        }

        await removeStoredFile(hash, path)
        return { data: null, message: '删除成功' }
      })
    }
  },
  // /delete-files
  {
    method: 'delete',
    path: '/delete-files',
    handler(req, res) {
      catchError(res, async () => {
        const hashes = parseHashList(req.query.hashes)
        if (!hashes.length) throw new Error('请选择要删除的文件')

        const { token } = req.cookies
        const admin = await client.get(ADMIN)
        if (!isAdminToken(admin, token)) {
          return { status: 'Fail', message: '仅管理员可批量删除' }
        }

        const failed: string[] = []
        for (const hash of hashes) {
          try {
            await removeStoredFile(hash, FileApi.getPath(hash))
          } catch (err) {
            console.warn(err)
            failed.push(hash)
          }
        }

        if (failed.length) {
          return {
            status: 'Fail',
            message: `已删除 ${hashes.length - failed.length} 个文件，${failed.length} 个失败`,
            data: { failed }
          }
        }

        return { data: { deleted: hashes.length }, message: '批量删除成功' }
      })
    }
  }
])

/** @在项目启动后建立文件索引（路径 key 与 MD5） */
nextTick(() => {
  try {
    getDirectoryTree(getStorageRoot())
  } catch (error) {
    console.warn('初始化文件索引失败', error)
  }
})
