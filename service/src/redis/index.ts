import { createClient } from 'redis'

const rh = process.env.REDIS_HOST || '127.0.0.1'
const port = process.env.REDIS_PORT || '6379'
export const client = createClient({
  url: `redis://${rh}:${port}`,
})

client.on('error', err => global.console.log('Redis Client Error', err));

(async () => {
  await client.connect()
  global.console.log('Redis 已连接')
})()