import { calculateMD5ByPath, isHardLink, md5FileMap } from '#src/utils'
import { NextFunction, Request, Response } from 'express'
import { existsSync, linkSync, mkdirSync, unlinkSync } from 'fs'
import multer from 'multer'
import { resolve } from 'path'

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const day = now.getDate()

    const formattedDate = `${year}-${month}-${day}`
    const path = resolve(
      __dirname,
      process.env.NODE_ENV === 'production' ? './static' : '../static',
      formattedDate
    )
    !existsSync(path) && mkdirSync(path)
    cb(null, path)
  },
  filename(req, file, cb) {
    const c = req.cookies.filePwd ?? ''
    const isPublic = +req.cookies.isPublic
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8')
    cb(null, `${isPublic ? '' : `${c}#`}${Date.now()}-${file.originalname}`)
  }
})

const fileSize = 100 * 1024 * 1024

// 创建基础的 multer 实例
const upload = multer({
  storage,
  limits: {
    fileSize
  }
})

// MD5 检查中间件
const md5Check = async (req: Request, res: Response, next: NextFunction) => {
  const files = req.files || (req.file ? [req.file] : [])
  if (!files.length) return next()

  try {
    for (const file of Array.isArray(files) ? files : Object.values(files).flat()) {
      const filePath = resolve(file.destination, file.filename)
      const md5 = await calculateMD5ByPath(filePath)

      if (md5FileMap.has(md5)) {
        const existingPath = md5FileMap.get(md5)!
        try {
          // 先创建硬链接
          const tempPath = `${filePath}.tmp`
          linkSync(existingPath, tempPath)
          // 删除新上传的文件
          unlinkSync(filePath)
          // 将临时文件重命名为目标文件
          linkSync(tempPath, filePath)
          unlinkSync(tempPath)

          // 验证硬链接是否创建成功
          if (!isHardLink(filePath)) {
            console.error('Hard link verification failed')
            throw new Error('Failed to create hard link')
          }
        } catch (err) {
          console.error('Failed to create hard link:', err)
          // 如果创建硬链接失败，保留原文件
          if (!existsSync(filePath)) {
            linkSync(existingPath, filePath)
          }
        }
      } else {
        md5FileMap.set(md5, filePath)
      }
    }
    next()
  } catch (err) {
    console.error('Error calculating MD5:', err)
    next(err)
  }
}

// 导出包含 MD5 检查的上传中间件
export const uploadInstance = {
  single: (fieldName: string) => [upload.single(fieldName), md5Check],
  array: (fieldName: string, maxCount?: number) => [upload.array(fieldName, maxCount), md5Check],
  fields: (fields: multer.Field[]) => [upload.fields(fields), md5Check],
  any: () => [upload.any(), md5Check]
}
