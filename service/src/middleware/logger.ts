import { NextFunction, Request, Response } from 'express'

/** Hides the optional password segment of `/check-file/:hash/:filename/:password`. */
export function redactUrl(url: string) {
  return url.replace(/(\/check-file\/[^/?]+\/[^/?]+\/)[^/?]+/, '$1***')
}

// Headers and bodies are not logged: cookies carry the admin token and file passwords.
const logger = (req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${req.ip} ${req.method} ${redactUrl(req.originalUrl || req.url)}`)
  next()
}

export default logger
