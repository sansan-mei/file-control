import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

// No application .env or proxy: browser tests must never contact production APIs.
export default defineConfig({
  envDir: './tests/no-env',
  define: { 'import.meta.env.VITE_GLOB_API_URL': JSON.stringify('/__test_api') },
  plugins: [vue(), vueJsx()],
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss, autoprefixer] } }
})
