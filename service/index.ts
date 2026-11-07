import '#src/api'
import { errorHandler } from '#src/middleware/errorHandler'
import logger from '#src/middleware/logger'
import '#src/redis'
import { renderRoutes } from '#src/utils'
import cookies from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import { sep } from 'path'

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的异步err:', promise, 'reason:', reason)
})
process.on('uncaughtException', (error) => {
  // The process state is unknown after an uncaught exception; exit and let the
  // container restart policy bring up a clean instance.
  console.error('Uncaught Exception thrown', error)
  process.exit(1)
})

const app = express()
const router = express.Router()
app.use(
  cors({
    credentials: true,
    origin: process.env.ALLOW_ORIGIN || '*'
  })
)
app.use(cookies())
app.set('trust proxy', true)

app.use(
  express.static('public', {
    setHeaders(res, path) {
      if (/\.html$|[\\/]sw\.js$|\.webmanifest$/.test(path)) {
        // Entry points must be revalidated so a deploy is picked up immediately.
        res.setHeader('Cache-Control', 'no-cache')
      } else if (path.includes(`${sep}assets${sep}`)) {
        // Vite output under assets/ is content-hashed.
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      } else {
        res.setHeader('Cache-Control', 'public, max-age=43200')
      }
    }
  })
)

app.use(logger)
app.use(router)

renderRoutes(router)

app.use(errorHandler)

app.listen(3003, () => {
  console.log('Server is running on port 3003')
})
