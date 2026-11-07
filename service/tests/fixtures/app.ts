import '../../src/api'
import { errorHandler } from '../../src/middleware/errorHandler'
import { uploadInstance } from '../../src/middleware/uploadInstance'
import { md5FileMap, renderRoutes } from '../../src/utils'
import cookies from 'cookie-parser'
import express from 'express'

export { md5FileMap, calculateMD5FromBuffer } from '../../src/utils'
export { parseStoredName } from '../../src/utils/storedName'
export { redactUrl } from '../../src/middleware/logger'
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
// Same JSON error contract as the production entry point.
app.use(errorHandler)
