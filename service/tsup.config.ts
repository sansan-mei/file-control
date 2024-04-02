import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['./index.ts'],
  outDir: 'build',
  target: 'es2022',
  format: ['esm'],
  splitting: false,
  sourcemap: false,
  minify: false,
  shims: true,
  dts: false,
})
