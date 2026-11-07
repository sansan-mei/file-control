import { getStorageRoot } from '#src/constant'
import { UserError, getFolderSize } from '#src/utils'
import { randomUUID } from 'crypto'
import type { Request } from 'express'

const DEFAULT_MAX_STORAGE_BYTES = 20720 * 1024 * 1024
const uploadQueueThresholdBytes = 20 * 1024 * 1024
const uploadReservationTtl = 10 * 60 * 1000
const uploadReservations = new Map<string, { size: number; expiresAt: number }>()

/** Read per call so the limits follow the environment without a restart-only module constant. */
const maxStorageBytes = () => Number(process.env.MAX_STORAGE_BYTES) || DEFAULT_MAX_STORAGE_BYTES
const maxConcurrentUploads = () => Number(process.env.MAX_CONCURRENT_UPLOADS) || 5

function cleanupUploadReservations() {
  const now = Date.now()
  for (const [token, reservation] of uploadReservations) {
    if (reservation.expiresAt <= now) uploadReservations.delete(token)
  }
}

function getReservedUploadBytes(excludeToken?: string) {
  cleanupUploadReservations()
  let total = 0
  for (const [token, reservation] of uploadReservations) {
    if (token !== excludeToken) total += reservation.size
  }
  return total
}

/** Throws when `size` more bytes would exceed the storage limit. */
export function assertStorageAvailable(size: number, excludeToken?: string) {
  const folderSize = getFolderSize(getStorageRoot())
  if (size + folderSize + getReservedUploadBytes(excludeToken) >= maxStorageBytes()) {
    throw new UserError('占用超出上限')
  }
}

export function reserveUpload(size: number) {
  cleanupUploadReservations()
  if (size < uploadQueueThresholdBytes) return null
  if (uploadReservations.size >= maxConcurrentUploads()) throw new UserError('上传队列已满')

  const token = randomUUID()
  uploadReservations.set(token, {
    size,
    expiresAt: Date.now() + uploadReservationTtl
  })
  return token
}

export function releaseUploadReservation(token?: unknown) {
  if (typeof token === 'string') uploadReservations.delete(token)
}

/** Token readable before the multipart body is parsed (header first, then query). */
export function getUploadTokenFromRequest(req: Request) {
  const header = req.headers['x-upload-token']
  if (typeof header === 'string' && header) return header
  return typeof req.query.uploadToken === 'string' ? req.query.uploadToken : undefined
}
