import { existsSync, mkdirSync } from 'fs'
import multer from 'multer'
import { resolve } from 'path'
import { md5Check } from './md5Check'

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
    console.log(`[${file.originalname}] File upload detected:`)
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

// 导出包含 MD5 检查的上传中间件
export const uploadInstance = {
  single: (fieldName: string) => [upload.single(fieldName), md5Check],
  array: (fieldName: string, maxCount?: number) => [upload.array(fieldName, maxCount), md5Check],
  fields: (fields: multer.Field[]) => [upload.fields(fields), md5Check],
  any: () => [upload.any(), md5Check]
}
