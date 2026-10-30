import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('esbuild replacement preserves the existing ESM deployment artifact without starting the service', async () => {
  const result = spawnSync(process.execPath, ['build.mjs'], { cwd: serviceRoot, encoding: 'utf8', timeout: 30000 })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const output = await readFile(resolve(serviceRoot, 'build/index.mjs'), 'utf8')
  assert.match(output, /from "express"/)
  assert.match(output, /from "redis"/)
  assert.ok(!output.includes('#src/'), 'Internal TS aliases must be bundled')
  assert.match(output, /createRequire/, 'ESM keeps the CommonJS shim previously supplied by tsup')
  const check = spawnSync(process.execPath, ['--check', 'build/index.mjs'], { cwd: serviceRoot, encoding: 'utf8' })
  assert.equal(check.status, 0, check.stderr)
})
