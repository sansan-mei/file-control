import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { fileURLToPath } from 'node:url'

// Isolated from application .env files and production proxies.
export default defineConfig({
  envDir: './tests/no-env',
  plugins: [vue(), vueJsx()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'], maxWorkers: 1 }
})
