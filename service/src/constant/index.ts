import { join } from 'path'

export const NOT_SHOW_PASS = 'NNN_NOT_SHOW'

/** HTTP Cache-Control max-age in seconds (7 days). */
export const expireTime = 60 * 60 * 24 * 7

export const ADMIN = 'admin'

/** Per-file multipart limit. */
export const MAX_UPLOAD_FILE_SIZE = 100 * 1024 * 1024

/** Files accepted in a single multipart request. The web client sends one. */
export const MAX_UPLOAD_FILES = 10

/** Upper bound for one upload request body (all files plus multipart overhead). */
export const MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_FILE_SIZE * MAX_UPLOAD_FILES + 1024 * 1024

/** Root directory holding uploaded files; resolved per call so tests can chdir first. */
export function getStorageRoot() {
  return join(process.cwd(), process.env.NODE_ENV === 'production' ? './static' : './src/static')
}
