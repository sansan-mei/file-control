import express from 'express'
import cookies from 'cookie-parser'


process.setUncaughtExceptionCaptureCallback((error) => {
  global.console.error(error)
})

const app = express()
const router = express.Router()
app.use(express.static('public', {
  maxAge: '12h',
  immutable: true,
}))

app.all('*', (_, res, next) => {
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.header('Access-Control-Allow-Methods', '*')
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})
app.set('trust proxy', true)
app.use(cookies())

router.get('/', (req, res) => {
  res.send('Hello World')
})


app.listen(3003, () => {
  console.log('Server is running on port 3003');
})




