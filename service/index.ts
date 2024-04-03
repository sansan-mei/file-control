import express from 'express'
import cookies from 'cookie-parser'
import "#src/redis"
import '#src/api'
import { renderRoutes } from '#src/utils'
import cors from 'cors'

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的异步err:', promise, 'reason:', reason)
})
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception thrown', error)
})

const app = express()
const router = express.Router()
app.use(cors({
  credentials: true,
  origin: process.env.ALLOW_ORIGIN || '*'
}))

app.all("*", (req, res, next) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  next()
})

app.use(express.static('public', {
  maxAge: '12h',
  immutable: true,
}))
app.use(cookies())
app.use(router)
app.set('trust proxy', true)

renderRoutes(router)

app.listen(3003, () => {
  console.log('Server is running on port 3003');
})


