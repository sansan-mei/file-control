import '../../src/api'
import { uploadInstance } from '../../src/middleware/uploadInstance'
import { md5FileMap, renderRoutes } from '../../src/utils'
import cookies from 'cookie-parser'
import express from 'express'

export { md5FileMap, calculateMD5FromBuffer } from '../../src/utils'
export const app = express()
app.use(cookies())
const router = express.Router()
renderRoutes(router)
app.use(router)
// Exercise the proxy-addr regression through Express, without changing production trust policy.
const proxyApp = express()
proxyApp.set('trust proxy', '::ffff:10.0.0.0/8')
proxyApp.get('/ip', (req, res) => res.json({ ip: req.ip }))
app.use('/proxy', proxyApp)
app.post('/fields', uploadInstance.fields([{ name: 'document', maxCount: 1 }]), (_req: express.Request, res: express.Response) => {
  res.json({ hashes: [...md5FileMap.keys()] })
})
app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err)
  res.status(400).json({ error: err.message, code: 'code' in err ? err.code : undefined })
})
