import { MAX_UPLOAD_FILES, MAX_UPLOAD_FILE_SIZE, getStorageRoot } from '#src/constant'
import { UserError } from '#src/utils'
import { INVALID_FILE_PASSWORD_MESSAGE, isValidFilePassword } from '#src/utils/storedName'
import { mkdirSync } from 'fs'
import multer from 'multer'
import { basename, resolve } from 'path'
import { md5Check } from './md5Check'

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth() + 1
      const day = now.getDate()

      const formattedDate = `${year}-${month}-${day}`
      const path = resolve(getStorageRoot(), formattedDate)
      mkdirSync(path, { recursive: true })
      cb(null, path)
    } catch (error) {
      cb(error as Error, '')
    }
  },
  filename(req, file, cb) {
    const password = req.cookies?.filePwd ?? ''
    const isPublic = +req.cookies?.isPublic
    if (!isPublic && !isValidFilePassword(password)) {
      return cb(new UserError(INVALID_FILE_PASSWORD_MESSAGE), '')
    }

    // busboy already strips client paths; keep a local guarantee as well.
    let originalname = basename(Buffer.from(file.originalname, 'latin1').toString('utf8'))
    if (!originalname || originalname === '.' || originalname === '..') originalname = 'file'
    file.originalname = originalname
    console.log(`[${file.originalname}] File upload detected:`)

    const name = `${isPublic ? '' : `${password}#`}${Date.now()}-${originalname}`
    // The stored name must stay a single path segment inside the destination directory.
    if (basename(name) !== name) return cb(new UserError('文件名不合法'), '')
    cb(null, name)
  }
})

// 创建基础的 multer 实例
const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_FILE_SIZE,
    files: MAX_UPLOAD_FILES
  }
})

// 导出包含 MD5 检查的上传中间件
export const uploadInstance = {
  single: (fieldName: string) => [upload.single(fieldName), md5Check],
  array: (fieldName: string, maxCount?: number) => [upload.array(fieldName, maxCount), md5Check],
  fields: (fields: multer.Field[]) => [upload.fields(fields), md5Check],
  any: () => [upload.any(), md5Check]
}
