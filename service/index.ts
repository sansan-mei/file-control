import express from 'express'
import cookies from 'cookie-parser'
import '#src/api'
import { renderRoutes } from '#src/utils'
import { mkdirSync } from 'fs'

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的异步err:', promise, 'reason:', reason)
})
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception thrown', error)
})

const app = express()
const router = express.Router()
app.use(express.static('public', {
  maxAge: '12h',
  immutable: true,
}))
app.use(cookies())
app.use(router)
app.set('trust proxy', true)

app.all('*', (req, res, next) => {
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.header('Access-Control-Allow-Methods', '*')
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})

renderRoutes(router)

app.listen(3003, () => {
  console.log('Server is running on port 3003');
})


