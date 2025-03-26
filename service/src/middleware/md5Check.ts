import { calculateMD5ByPath, isHardLink, md5FileMap } from '#src/utils'
import { NextFunction, Request, Response } from 'express'
import { existsSync, linkSync, unlinkSync } from 'fs'
import { resolve } from 'path'

/**
 * MD5检查中间件
 * 用于检测重复文件并创建硬链接以节省存储空间
 * 处理流程：
 * 1. 计算上传文件的MD5
 * 2. 检查是否存在相同MD5的文件
 * 3. 如果存在，创建硬链接；如果不存在，记录新文件
 */
export const md5Check = async (req: Request, res: Response, next: NextFunction) => {
  // 获取上传的文件列表，支持单文件和多文件上传
  const files = req.files || (req.file ? [req.file] : [])
  if (!files.length) return next()

  try {
    for (const file of Array.isArray(files) ? files : Object.values(files).flat()) {
      const filePath = resolve(file.destination, file.filename)
      // 计算文件的MD5值
      const md5 = await calculateMD5ByPath(filePath)

      if (md5FileMap.has(md5)) {
        const existingPath = md5FileMap.get(md5)!

        // 如果原文件不存在，更新MD5映射为新文件
        if (!existsSync(existingPath)) {
          md5FileMap.delete(md5)
          md5FileMap.set(md5, filePath)
          continue
        }

        try {
          // 创建硬链接的步骤：
          // 1. 创建临时硬链接
          // 2. 删除新上传的文件
          // 3. 用临时文件创建最终的硬链接
          // 4. 删除临时文件
          const tempPath = `${filePath}.tmp`
          linkSync(existingPath, tempPath)
          unlinkSync(filePath)
          linkSync(tempPath, filePath)
          unlinkSync(tempPath)

          // 验证硬链接是否创建成功
          if (!isHardLink(filePath)) {
            throw new Error('Failed to create hard link')
          }
        } catch (err) {
          // 如果硬链接创建失败且文件不存在
          // 尝试恢复原始文件
          if (!existsSync(filePath)) {
            linkSync(existingPath, filePath)
          }
        }
      } else {
        // 记录新文件的MD5和路径
        md5FileMap.set(md5, filePath)
      }
    }
    next()
  } catch (err) {
    next(err)
  }
}
