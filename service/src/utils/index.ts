import { NOT_SHOW_PASS } from '#src/constant'
import type { CatchErrorType, DirectoryNode, MyResponseType, RouterConfig } from '#src/types'
import { Buffer } from 'buffer'
import crypto from 'crypto'
import CryptoJS from 'crypto-js'
import { Router } from 'express'
import fs, { createReadStream, statSync } from 'fs'
import { basename, join } from 'path'

/** @用来缓存md5和文件路径 */
export const md5FileMap = new Map<string, string>()

export const FileApi = (() => {
  /** @用来缓存加密未加密的文件路径 */
  const filePathMap = new Map()

  function encrypt(path: string) {
    // 先检查是否是文件
    const stats = statSync(path)
    if (stats.isFile()) {
      // 只对文件计算MD5
      calculateMD5ByPath(path)
        .then((md5) => {
          if (!md5FileMap.has(md5)) {
            md5FileMap.set(md5, path)
          }
        })
        .catch(console.error)
    }

    if (filePathMap.has(path)) {
      return filePathMap.get(path)
    } else {
      const key = CryptoJS.SHA256(path).toString(CryptoJS.enc.Hex)
      filePathMap.set(path, key)
      filePathMap.set(key, path)
      return key
    }
  }

  function getPath(hash: string) {
    return decodeURIComponent(filePathMap.get(hash))
  }

  function removePath(hash: string) {
    const r = [filePathMap.delete(getPath(hash)), filePathMap.delete(hash)].every((v) => v)
    return r
  }

  return {
    encrypt,
    getPath,
    removePath
  }
})()

export function getDirectoryTree(path: string): DirectoryNode | null {
  const stats = fs.statSync(path)

  const key = FileApi.encrypt(path)
  if (stats.isDirectory()) {
    const dirNode: DirectoryNode = {
      key,
      label: basename(path),
      isFile: false,
      children: []
    }
    const files = fs.readdirSync(path).sort((a, b) => {
      // 将文件名转换为Date对象进行比较
      const dateA = new Date(a)
      const dateB = new Date(b)

      // 如果其中一个日期无效，则返回该日期在前面
      if (!dateA.getTime()) return -1
      else if (!dateB.getTime()) return 1

      // 按日期升序排序，最新的文件排在最后
      return dateA.getTime() - dateB.getTime()
    })

    files.forEach((file) => {
      // 忽略 .gitkeep 和 .DS_Store 文件
      if (file === '.gitkeep' || file === '.DS_Store') return
      const childPath = join(path, file)
      const childStats = fs.statSync(childPath)
      const childNode = getDirectoryTree(childPath)

      const key = FileApi.encrypt(childPath)
      if (childStats.isDirectory() && childNode) {
        dirNode.children?.push(childNode)
      } else if (childStats.isFile() && childNode) {
        dirNode.children?.push({
          key,
          label: file.slice(file.indexOf('-') + 1),
          isFile: true,
          size: childStats.size
        })
      }
    })
    if (dirNode.children && dirNode.children.length) {
      return dirNode
    } else {
      return null
    }
  } else if (stats.isFile() && !path.includes(NOT_SHOW_PASS)) {
    return {
      key,
      label: basename(path),
      isFile: true,
      size: stats.size
    }
  } else {
    return null
  }
}

export function getFolderSize(folderPath: string) {
  let totalSize = 0
  const files = fs.readdirSync(folderPath)

  files.forEach((file) => {
    const filePath = join(folderPath, file)
    const stats = fs.statSync(filePath)

    if (stats.isFile()) totalSize += stats.size
    else if (stats.isDirectory()) totalSize += getFolderSize(filePath)
  })

  return totalSize / 1024
}

class ApiConfig {
  public router = new Set<RouterConfig>()
  constructor() {
    this.router = new Set()
  }

  add(list: RouterConfig) {
    this.router.add(list)
  }

  getAllRouter() {
    return Array.from(this.router).flat()
  }
}
export const $api = new ApiConfig()

export async function catchError<
  A extends 'stream' | 'other' = 'other',
  T extends CatchErrorType = CatchErrorType<A>
>(res: T['res'] | T, callback: T['callback'], errorMsg?: T['errorMsg']) {
  let r: T['res']
  let c = callback
  let e = errorMsg
  if ('res' in res && 'callback' in res) {
    r = res.res
    c = res.callback
    e = res.errorMsg
  } else {
    r = res as T['res']
  }

  try {
    const result = await c()
    r.write(typeof result === 'object' ? resp(result) : result)
  } catch (error: any) {
    if (typeof errorMsg === 'function') {
      errorMsg(error)
    } else {
      console.warn(error)
      r.write(resp({ status: 'Fail', message: e ?? error.message }))
    }
  } finally {
    r.end()
  }
}

export function resp<T>({
  data = undefined,
  code = 200,
  message = 'Success',
  status = 'Success'
}: Partial<MyResponseType<T>>) {
  try {
    return JSON.stringify({
      code,
      message,
      data,
      status
    })
  } catch (error) {
    console.warn(error)
  }
}

export function renderRoutes(router: Router) {
  for (const routeConfig of $api.getAllRouter()) {
    const method = routeConfig.method || 'get'
    const path = `${process.env.NODE_ENV === 'production' ? '/api' : ''}${routeConfig.path}`
    router[method](path, routeConfig.middleware || [], routeConfig.handler)
    global.console.log(`[Router] ${routeConfig.method || 'get'} ${routeConfig.path} 已启动`)
  }
}

export async function calculateMD5ByPath(filePath: string): Promise<string> {
  const hash = crypto.createHash('md5')
  const fileStream = createReadStream(filePath)
  return new Promise((resolve, reject) => {
    fileStream.on('data', function (data) {
      hash.update(data as string, 'utf8')
    })

    fileStream.on('end', function () {
      const fileMD5 = hash.digest('hex')
      resolve(fileMD5)
    })

    fileStream.on('error', reject)
  })
}

export function calculateMD5FromBuffer(buffer: Buffer) {
  const hash = crypto.createHash('md5')
  hash.update(buffer.toString()) // Convert Buffer to string before updating
  return hash.digest('hex') // 返回Buffer的MD5哈希值
}

export function isHardLink(filePath: string) {
  try {
    const stats = statSync(filePath)
    return stats.nlink > 1
  } catch (err) {
    return false
  }
}
