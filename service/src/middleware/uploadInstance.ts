import { existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import multer from 'multer'

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const day = now.getDate()
    const formattedDate = `${year}-${month}-${day}`
    const path = resolve(__dirname, process.env.NODE_ENV === 'production' ? './static' : '../static', formattedDate)
    !existsSync(path) && mkdirSync(path)
    cb(null, path)
  },
  filename(req, file, cb) {
    const c = req.cookies.filePwd ?? ''
    const isPublic = +req.cookies.isPublic
    file.originalname = Buffer.from(file.originalname, 'latin1').toString(
      'utf8',
    )
    cb(null, `${isPublic ? '' : `${c}#`}${Date.now()}-${file.originalname}`)
  },
})
const fileSize = 100 * 1024 * 1024
export const uploadInstance = multer({
  storage,
  limits: {
    fileSize,
  },
})
