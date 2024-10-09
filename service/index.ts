import '#src/api'
import '#src/redis'
import { renderRoutes } from '#src/utils'
import cookies from 'cookie-parser'
import cors from 'cors'
import express from 'express'

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的异步err:', promise, 'reason:', reason)
})
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception thrown', error)
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
    maxAge: '12h',
    immutable: true
  })
)
app.use(router)

renderRoutes(router)

app.listen(3003, () => {
  console.log('Server is running on port 3003')
})
