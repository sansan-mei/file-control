declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production'
      PORT: string
      TEED: string | undefined
      HASH_SALT: string | undefined
      OPENAI_API_BASE_URL: string | undefined
    }
  }
}

export { }
