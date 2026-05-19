import { ADMIN, NOT_SHOW_PASS, expireTime } from '#src/constant'
import { uploadInstance } from '#src/middleware/uploadInstance'
import { client } from '#src/redis'
import { $api, FileApi, catchError, getDirectoryTree, getFolderSize } from '#src/utils'
import { randomUUID } from 'crypto'
import { createReadStream, statSync } from 'fs'
import { unlink } from 'fs/promises'
import mime from 'mime'
import { basename, join } from 'path'
import { nextTick } from 'process'

/** @其他常量 */
const maxStorageBytes = Number(process.env.MAX_STORAGE_BYTES) || 20720 * 1024 * 1024
const maxConcurrentUploads = Number(process.env.MAX_CONCURRENT_UPLOADS) || 5
const uploadQueueThresholdBytes = 20 * 1024 * 1024
const uploadReservationTtl = 10 * 60 * 1000
const uploadReservations = new Map<string, { size: number; expiresAt: number }>()

const pathTo = join(
  process.cwd(),
  process.env.NODE_ENV === 'production' ? './static' : './src/static'
)

function cleanupUploadReservations() {
  const now = Date.now()
  for (const [token, reservation] of uploadReservations) {
    if (reservation.expiresAt <= now) uploadReservations.delete(token)
  }
}

function getReservedUploadBytes() {
  cleanupUploadReservations()
  return Array.from(uploadReservations.values()).reduce((total, item) => total + item.size, 0)
}

function reserveUpload(size: number) {
  cleanupUploadReservations()
  if (size < uploadQueueThresholdBytes) return null
  if (uploadReservations.size >= maxConcurrentUploads) throw new Error('上传队列已满')

  const token = randomUUID()
  uploadReservations.set(token, {
    size,
    expiresAt: Date.now() + uploadReservationTtl
  })
  return token
}

function releaseUploadReservation(token?: unknown) {
  if (typeof token === 'string') uploadReservations.delete(token)
}

function parseHashList(value: unknown) {
  const rawValue = Array.isArray(value) ? value.join(',') : value
  if (typeof rawValue !== 'string') return []
  return rawValue
    .split(',')
    .map((hash) => hash.trim())
    .filter(Boolean)
}

$api.add([
  // /admin-status
  {
    path: '/admin-status',
    handler(req, res) {
      catchError(res, async () => {
        const { token } = req.cookies
        const admin = await client.get(ADMIN)
        return { data: { isAdmin: !!admin && token === admin } }
      })
    }
  },
  // /directory-tree
  {
    path: '/directory-tree',
    handler(req, res) {
      catchError(res, async () => {
        const dirTree = getDirectoryTree(pathTo)
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
        const hash = req.params.hash
        const filename = req.params.filename
        const filePwd = req.params.password || req.cookies.filePwd
        const { token } = req.cookies

        const path = FileApi.getPath(hash)
        const type = mime.getType(path)
        if (type) {
          res.setHeader('content-type', `${type}; charset=utf-8`) // 确保添加了字符编码
        }

        if (req.headers['if-none-match'] === hash) {
          res.setHeader('cache-control', `max-age=${expireTime},public`) // 缓存响应
          res.status(304).end()
          return
        }
        const admin = await client.get(ADMIN)
        const stat = statSync(path)
        const prefixFilename = basename(path)
        const prefix = prefixFilename.slice(0, prefixFilename.indexOf('-'))
        /** @description:验证文件密码是否跟提交的时候一致 */
        if (token !== admin && !path.includes(NOT_SHOW_PASS)) {
          if (prefix.includes('#')) {
            const pwd = prefix.slice(0, prefix.indexOf('#'))
            if (filePwd !== pwd) {
              res.setHeader('content-type', 'text/html; charset=utf-8')
              return res.status(403).end('密码错误')
            }
          }
        }

        res.setHeader('cache-control', `max-age=${expireTime},public`) // 缓存响应
        res.setHeader('ETag', hash) // 缓存响应

        // Range support
        const range = req.headers.range
        if (range) {
          const positions = range.replace(/bytes=/, '').split('-')
          const start = parseInt(positions[0], 10)
          const total = stat.size
          const end = positions[1] ? parseInt(positions[1], 10) : total - 1
          const chunksize = end - start + 1

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize
          })

          const readStream = createReadStream(path, { start, end })
          readStream.on('error', console.error)
          readStream.pipe(res)
        } else {
          res.setHeader('Content-Length', stat.size) // 添加文件大小到响应头
          filename &&
            res.setHeader('Content-Disposition', `inline; filename=${encodeURIComponent(filename)}`) // 设置文件名
          const readStream = createReadStream(path)
          readStream.on('error', console.error)
          readStream.pipe(res)
        }
      } catch (error) {
        console.error(error)
        res.status(400)
        res.end('状态异常')
      }
    }
  },
  // /upload-file post
  {
    method: 'post',
    path: '/upload-file',
    middleware: [uploadInstance.any()],
    handler(req, res) {
      catchError(res, async () => {
        releaseUploadReservation(req.body?.uploadToken || req.query.uploadToken)
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

        const folderSize = getFolderSize(pathTo)
        const reservedSize = getReservedUploadBytes()
        if (size + folderSize + reservedSize >= maxStorageBytes) throw new Error('占用超出上限')

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
      catchError(
        res,
        async () => {
          const hash = req.query.hash as string
          const { token, filePwd } = req.cookies
          const path = FileApi.getPath(hash)
          const admin = await client.get(ADMIN)
          if (admin === token || path.includes(NOT_SHOW_PASS)) {
            unlink(path).catch((err) => console.warn(err))
            FileApi.removePath(hash)
            return { data: null, message: '删除成功' }
          } else {
            const regex = /#\d+-/
            const hasPass = path.match(regex)?.[0]?.length === 15
            if (!hasPass) return { status: 'Fail', message: '公用文件只允许管理员删除' }
            const pass = basename(path).split('#')[0]
            if (filePwd === pass) {
              unlink(path).catch((err) => console.warn(err))
              FileApi.removePath(hash)
              return { data: null, message: '删除成功' }
            }
          }
          return { status: 'Fail', message: '密码错误' }
        },
        '文件不存在'
      )
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
        if (admin !== token) {
          return { status: 'Fail', message: '仅管理员可批量删除' }
        }

        const failed: string[] = []
        for (const hash of hashes) {
          try {
            const path = FileApi.getPath(hash)
            await unlink(path)
            FileApi.removePath(hash)
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

/** @在项目启动后重置一下几个map */
nextTick(() => {
  getDirectoryTree(pathTo)
})
