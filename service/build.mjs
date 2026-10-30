import { build } from 'esbuild'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Keep the artifact path consumed by the existing Dockerfile and prod script.
await rm(new URL('./build/', import.meta.url), { recursive: true, force: true })
await build({
  absWorkingDir: fileURLToPath(new URL('.', import.meta.url)),
  entryPoints: ['index.ts'],
  outfile: 'build/index.mjs',
  bundle: true,
  packages: 'external',
  platform: 'node',
  target: 'es2022',
  format: 'esm',
  tsconfig: 'tsconfig.json',
  sourcemap: false,
  minify: false,
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"
  },
  logLevel: 'info'
})
