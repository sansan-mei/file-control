import { NextFunction, Request, Response } from 'express'

const logger = (req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${req.method} ${req.url}`)
  console.log('Headers:', req.headers)
  console.log('Query:', req.query)
  console.log('Body:', req.body)
  console.log('-------------------\n')

  next()
}

export default logger
