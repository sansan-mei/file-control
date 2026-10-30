import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: { channel: 'chromium', baseURL: 'http://127.0.0.1:4176', trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js build --config tests/vite.e2e.config.ts --outDir dist/e2e && node node_modules/vite/bin/vite.js preview --config tests/vite.e2e.config.ts --outDir dist/e2e --host 127.0.0.1 --port 4176 --strictPort',
    timeout: 90000,
    url: 'http://127.0.0.1:4176',
    reuseExistingServer: false
  }
})
