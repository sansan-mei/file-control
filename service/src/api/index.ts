import { ADMIN, NOT_SHOW_PASS, expireTime } from '#src/constant'
import { uploadInstance } from '#src/middleware/uploadInstance'
import { client } from '#src/redis'
import { $api, FileApi, catchError, getDirectoryTree, getFolderSize } from '#src/utils'
import { createReadStream, statSync } from 'fs'
import { unlink } from 'fs/promises'
import mime from 'mime'
import { basename, join } from 'path'
import { nextTick } from 'process'

/** @其他常量 */
const uploadList: string[] = []

const pathTo = join(__dirname, process.env.NODE_ENV === 'production' ? './static' : '../static')

$api.add([
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
        uploadList.shift()
        return { data: null, message: '上传成功' }
      })
    }
  },
  // /check-memory
  {
    path: '/check-memory',
    handler(req, res) {
      catchError(res, async () => {
        const size = req.query.size as string
        const folderSize = getFolderSize(pathTo)
        // 单位为mb
        if (+size + folderSize >= 20720) throw new Error('占用超出上限')
        else if (uploadList.length >= 5) throw new Error('上传队列已满')
        ;+size >= 20 && uploadList.push(size)
        return { data: true }
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
  }
])

/** @在项目启动后重置一下几个map */
nextTick(() => {
  getDirectoryTree(pathTo)
})
