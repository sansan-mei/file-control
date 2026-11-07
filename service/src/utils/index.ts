import { NOT_SHOW_PASS } from '#src/constant'
import type { CatchErrorType, DirectoryNode, MyResponseType, RouterConfig } from '#src/types'
import { parseStoredName } from '#src/utils/storedName'
import crypto from 'crypto'
import { Router } from 'express'
import fs, { createReadStream, statSync } from 'fs'
import { basename, join } from 'path'

/** Errors whose message is safe to show to the client. */
export class UserError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'UserError'
    this.status = status
  }
}

/** @用来缓存md5和文件路径 */
export const md5FileMap = new Map<string, string>()

/** Paths already hashed (or queued), so listing the directory never re-reads file contents. */
const hashedPaths = new Set<string>()
/** Startup indexing reads files one at a time instead of opening every file at once. */
let hashQueue: Promise<void> = Promise.resolve()

/** Records a hash computed elsewhere (upload middleware). */
export function rememberFileHash(md5: string, path: string) {
  hashedPaths.add(path)
  if (!md5FileMap.has(md5)) md5FileMap.set(md5, path)
}

function indexFileHash(path: string) {
  if (hashedPaths.has(path)) return
  hashedPaths.add(path)
  hashQueue = hashQueue.then(async () => {
    if (!hashedPaths.has(path)) return // deleted while queued
    try {
      const md5 = await calculateMD5ByPath(path)
      if (hashedPaths.has(path) && !md5FileMap.has(md5)) md5FileMap.set(md5, path)
    } catch (error) {
      hashedPaths.delete(path)
      console.warn(error)
    }
  })
}

function forgetFileHash(path: string) {
  hashedPaths.delete(path)
  for (const [md5, candidate] of md5FileMap) {
    if (candidate === path) md5FileMap.delete(md5)
  }
}

export const FileApi = (() => {
  /** Public keys are SHA-256 of the absolute path, so existing share links stay stable. */
  const pathToKey = new Map<string, string>()
  const keyToPath = new Map<string, string>()

  function encrypt(path: string, isFile = false) {
    if (isFile) indexFileHash(path)

    const cached = pathToKey.get(path)
    if (cached) return cached
    const key = crypto.createHash('sha256').update(path, 'utf8').digest('hex')
    pathToKey.set(path, key)
    keyToPath.set(key, path)
    return key
  }

  function getPath(hash: string) {
    const path = typeof hash === 'string' ? keyToPath.get(hash) : undefined
    if (!path) throw new UserError('文件不存在', 404)
    return path
  }

  function removePath(hash: string) {
    const path = keyToPath.get(hash)
    if (!path) return false
    keyToPath.delete(hash)
    pathToKey.delete(path)
    forgetFileHash(path)
    return true
  }

  return {
    encrypt,
    getPath,
    removePath
  }
})()

function compareEntryNames(a: string, b: string) {
  // 将文件名转换为Date对象进行比较
  const dateA = new Date(a)
  const dateB = new Date(b)

  // 普通名称排在日期后；同类无效日期保持原有顺序，时间戳 0 仍是有效日期。
  const validA = !Number.isNaN(dateA.getTime())
  const validB = !Number.isNaN(dateB.getTime())
  if (!validA || !validB) return validA ? -1 : validB ? 1 : 0

  // 按日期降序排序，最新的文件排在前。
  return dateB.getTime() - dateA.getTime()
}

function readDirectory(path: string): DirectoryNode | null {
  const dirNode: DirectoryNode = {
    key: FileApi.encrypt(path),
    label: basename(path),
    isFile: false,
    children: []
  }

  for (const file of fs.readdirSync(path).sort(compareEntryNames)) {
    // 保留主分支对隐藏占位文件的过滤。
    if (file === '.gitkeep' || file === '.DS_Store') continue
    const childPath = join(path, file)
    let childStats: fs.Stats
    try {
      childStats = fs.statSync(childPath)
    } catch {
      continue // removed while listing
    }

    if (childStats.isDirectory()) {
      const childNode = readDirectory(childPath)
      if (childNode) dirNode.children!.push(childNode)
    } else if (childStats.isFile()) {
      // Hidden files still get a key so direct links keep working.
      const key = FileApi.encrypt(childPath, true)
      if (childPath.includes(NOT_SHOW_PASS)) continue
      dirNode.children!.push({
        key,
        label: parseStoredName(file).label,
        isFile: true,
        size: childStats.size
      })
    }
  }

  return dirNode.children!.length ? dirNode : null
}

export function getDirectoryTree(path: string): DirectoryNode | null {
  const stats = fs.statSync(path)
  if (stats.isDirectory()) return readDirectory(path)

  const key = FileApi.encrypt(path, stats.isFile())
  if (stats.isFile() && !path.includes(NOT_SHOW_PASS)) {
    return {
      key,
      label: basename(path),
      isFile: true,
      size: stats.size
    }
  }
  return null
}

export function getFolderSize(folderPath: string) {
  let totalSize = 0

  for (const file of fs.readdirSync(folderPath)) {
    const filePath = join(folderPath, file)
    let stats: fs.Stats
    try {
      stats = fs.statSync(filePath)
    } catch {
      continue // removed while scanning
    }

    if (stats.isFile()) totalSize += stats.size
    else if (stats.isDirectory()) totalSize += getFolderSize(filePath)
  }

  return totalSize
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
    if (typeof result === 'object') {
      if (!r.headersSent) r.setHeader('Content-Type', 'application/json; charset=utf-8')
      r.write(resp(result))
    } else {
      r.write(result)
    }
  } catch (error: any) {
    if (typeof e === 'function') {
      e(error)
    } else {
      console.warn(error)
      if (!r.headersSent) r.setHeader('Content-Type', 'application/json; charset=utf-8')
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
      hash.update(data)
    })

    fileStream.on('end', function () {
      const fileMD5 = hash.digest('hex')
      resolve(fileMD5)
    })

    fileStream.on('error', reject)
  })
}

export function calculateMD5FromBuffer(buffer: crypto.BinaryLike) {
  const hash = crypto.createHash('md5')
  hash.update(buffer)
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
