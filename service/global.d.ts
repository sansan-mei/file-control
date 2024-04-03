declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production'
      REDIS_HOST?: string
      REDIS_PORT?: string
    }
  }
}

export { }
