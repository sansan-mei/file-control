/**
 * Stored file names keep the historical on-disk format so existing files and links stay valid:
 * - public:    `<13-digit timestamp>-<original name>`
 * - protected: `<password>#<13-digit timestamp>-<original name>`
 */
const PUBLIC_NAME = /^\d{13}-/
const PROTECTED_NAME = /^([^]*?)#\d{13}-/

export interface StoredName {
  /** `null` for public files; may be an empty string for files uploaded with an empty password. */
  password: string | null
  /** Name shown to users. */
  label: string
}

export function parseStoredName(fileName: string): StoredName {
  if (PUBLIC_NAME.test(fileName)) {
    return { password: null, label: fileName.slice(fileName.indexOf('-') + 1) }
  }

  const match = PROTECTED_NAME.exec(fileName)
  if (match) return { password: match[1], label: fileName.slice(match[0].length) }

  // Names not produced by the uploader (e.g. copied in manually) keep the historical rules.
  const label = fileName.slice(fileName.indexOf('-') + 1)
  const prefix = fileName.slice(0, fileName.indexOf('-'))
  if (prefix.includes('#')) return { password: prefix.slice(0, prefix.indexOf('#')), label }
  return { password: null, label }
}

export const INVALID_FILE_PASSWORD_MESSAGE = '文件密码不能包含 / 或 \\'

/** Passwords become part of the stored file name, so path separators are never allowed. */
export function isValidFilePassword(password: string) {
  return !/[\\/\0]/.test(password)
}
