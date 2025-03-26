import { calculateMD5ByPath, isHardLink, md5FileMap } from '#src/utils'
import { NextFunction, Request, Response } from 'express'
import { existsSync, linkSync, unlinkSync } from 'fs'
import { resolve } from 'path'

// MD5 检查中间件
export const md5Check = async (req: Request, res: Response, next: NextFunction) => {
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
