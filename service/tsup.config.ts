import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['/index.ts'],
  outDir: 'build',
  target: 'es2022',
  format: ['esm'],
  splitting: false,
  sourcemap: true,
  minify: false,
  shims: true,
  dts: false,
})
