import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')
let sandbox, server, base, fixture
const originalCwd = process.cwd()
const originalNodeEnv = process.env.NODE_ENV

before(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'file-control-service-test-'))
  await mkdir(join(sandbox, 'src/static'), { recursive: true })
  const result = esbuild.buildSync({
    absWorkingDir: serviceRoot,
    entryPoints: ['tests/fixtures/app.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'es2022',
    write: false,
    metafile: true,
    alias: { '#src/redis': join(serviceRoot, 'tests/fixtures/redis.ts') }
  })
  assert.ok(!Object.keys(result.metafile.inputs).some(path => /src\/redis\/|node_modules\/.*redis/.test(path)), 'Real Redis must not enter the test bundle')
  const bundle = join(sandbox, 'fixture.cjs')
  await writeFile(bundle, result.outputFiles[0].contents)
  process.env.NODE_ENV = 'development'
  process.chdir(sandbox)
  fixture = require(bundle)
  server = fixture.app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server) {
    const closed = new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
    server.closeAllConnections()
    await closed
  }
  process.chdir(originalCwd)
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
  if (sandbox) await rm(sandbox, { recursive: true, force: true })
})

function upload(body, name = 'document', filename = 'sample.txt') {
  const form = new FormData()
  form.append(name, new Blob([body]), filename)
  return form
}

// This shape is returned by multer.fields(), unlike the array returned by .any().
test('fields uploads are hashed by the real MD5 middleware', async () => {
  const body = 'fields-upload-regression'
  const hash = createHash('md5').update(body).digest('hex')
  const response = await fetch(`${base}/fields`, {
    method: 'POST', headers: { Cookie: 'isPublic=1' }, body: upload(body)
  })
  assert.equal(response.status, 200)
  assert.ok((await response.json()).hashes.includes(hash), 'multer.fields() file must enter the MD5 map')
})

async function request(path, options) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000), ...options })
  return { response, data: await response.json() }
}

async function diskFiles() {
  return (await readdir(join(sandbox, 'src/static'), { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile()).map(entry => join(entry.parentPath ?? entry.path, entry.name)).sort()
}

function leaves(node) {
  if (!node) return []
  return node.isFile ? [node] : (node.children ?? []).flatMap(leaves)
}

test('Express rejects spoofed forwarded IPs for short IPv4-mapped IPv6 trust prefixes', async () => {
  const { response, data } = await request('/proxy/ip', { headers: { 'X-Forwarded-For': '203.0.113.42' } })
  assert.equal(response.status, 200)
  assert.equal(data.ip, '127.0.0.1')
})

test('dev raw-byte buffer hashing is preserved for non-UTF8 binary content', () => {
  const bytes = Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x41])
  assert.equal(fixture.calculateMD5FromBuffer(bytes), createHash('md5').update(bytes).digest('hex'))
  assert.equal(fixture.calculateMD5FromBuffer(new Uint8Array(bytes)), createHash('md5').update(bytes).digest('hex'))
})

test('directory-tree preserves dev newest-first ordering without losing current file metadata or hidden-file filtering', async () => {
  const root = join(sandbox, 'src/static/directory-order-regression')
  for (const name of ['2024-01-01', '2026-10-31', '1970-01-01', 'alpha', 'zeta']) {
    const folder = join(root, name)
    await mkdir(folder, { recursive: true })
    await writeFile(join(folder, 'order-marker.txt'), 'sort-marker')
    await writeFile(join(folder, '.DS_Store'), 'ignored')
    await writeFile(join(folder, '.gitkeep'), '')
  }
  const { response, data } = await request('/directory-tree')
  assert.equal(response.status, 200)
  const tree = data.data.children.find(node => node.label === 'directory-order-regression')
  assert.ok(tree)
  assert.deepEqual(tree.children.map(node => node.label), ['2026-10-31', '2024-01-01', '1970-01-01', 'alpha', 'zeta'])
  assert.ok(leaves(tree).every(file => file.label === 'marker.txt' && file.size === Buffer.byteLength('sort-marker')))
})

test('public multipart upload, directory, download, range and ETag remain compatible', async () => {
  const body = 'public-upload-content'
  const { data } = await request('/upload-file', {
    method: 'POST', headers: { Cookie: 'isPublic=1' }, body: upload(body, 'file', '你好.txt')
  })
  assert.equal(data.status, 'Success')
  const tree = await request('/directory-tree')
  const file = leaves(tree.data.data).find(file => file.label === '你好.txt')
  assert.ok(file)
  assert.equal(file.size, Buffer.byteLength(body))
  const download = await fetch(`${base}/check-file/${file.key}/hello.txt`)
  assert.equal(download.status, 200)
  assert.equal(await download.text(), body)
  assert.equal(download.headers.get('etag'), file.key)
  const partial = await fetch(`${base}/check-file/${file.key}/hello.txt`, { headers: { Range: 'bytes=1-4' } })
  assert.equal(partial.status, 206)
  assert.equal(await partial.text(), body.slice(1, 5))
  const cached = await fetch(`${base}/check-file/${file.key}/hello.txt`, { headers: { 'If-None-Match': file.key } })
  assert.equal(cached.status, 304)
})

test('duplicate multipart uploads retain hard-link deduplication', async () => {
  const body = 'duplicate-content'
  const hash = createHash('md5').update(body).digest('hex')
  for (const name of ['duplicate-a.txt', 'duplicate-b.txt']) {
    const { data } = await request('/upload-file', {
      method: 'POST', headers: { Cookie: 'isPublic=1' }, body: upload(body, 'file', name)
    })
    assert.equal(data.status, 'Success')
  }
  const files = (await diskFiles()).filter(path => /duplicate-[ab]\.txt$/.test(path))
  assert.equal(files.length, 2)
  const [a, b] = await Promise.all(files.map(path => stat(path)))
  assert.equal(a.ino, b.ino)
  assert.ok(a.nlink >= 2)
  assert.ok(fixture.md5FileMap.has(hash))
})

test('password-protected download and admin batch deletion use only stubbed Redis', async () => {
  const filename = 'protected.txt'
  const uploaded = await request('/upload-file', {
    method: 'POST', headers: { Cookie: 'filePwd=secret; isPublic=0' }, body: upload('private-body', 'file', filename)
  })
  assert.equal(uploaded.data.status, 'Success')
  const tree = await request('/directory-tree')
  const file = leaves(tree.data.data).find(file => file.label === filename)
  assert.ok(file)
  const denied = await fetch(`${base}/check-file/${file.key}/${filename}`)
  assert.equal(denied.status, 403)
  await denied.text()
  const allowed = await fetch(`${base}/check-file/${file.key}/${filename}/secret`)
  assert.equal(await allowed.text(), 'private-body')
  const adminDownload = await fetch(`${base}/check-file/${file.key}/${filename}`, { headers: { Cookie: 'token=test-admin-token' } })
  assert.equal(await adminDownload.text(), 'private-body')
  assert.equal((await request('/admin-status')).data.data.isAdmin, false)
  assert.equal((await request('/admin-status', { headers: { Cookie: 'token=test-admin-token' } })).data.data.isAdmin, true)
  const rejectedDelete = await request(`/delete-files?hashes=${file.key}`, { method: 'DELETE', headers: { Cookie: 'token=wrong' } })
  assert.equal(rejectedDelete.data.status, 'Fail')
  const deleted = await request(`/delete-files?hashes=${file.key}`, { method: 'DELETE', headers: { Cookie: 'token=test-admin-token' } })
  assert.deepEqual(deleted.data.data, { deleted: 1 })
  const refreshed = await request('/directory-tree')
  assert.ok(!leaves(refreshed.data.data).some(candidate => candidate.key === file.key))
})

test('storage validation and large-upload reservation retain their response contract', async (t) => {
  const warnings = []
  t.mock.method(console, 'warn', error => warnings.push(error.message))
  const invalid = await request('/check-memory?size=-1')
  assert.equal(invalid.data.status, 'Fail')
  assert.deepEqual(warnings, ['文件大小异常'])
  const reserved = await request('/check-memory?size=20971520')
  assert.equal(reserved.data.status, 'Success')
  assert.match(reserved.data.data.uploadToken, /^[0-9a-f-]{36}$/)
  const form = upload('reservation-body', 'file', 'reserved.txt')
  form.append('uploadToken', reserved.data.data.uploadToken)
  const uploaded = await request('/upload-file', { method: 'POST', headers: { Cookie: 'isPublic=1' }, body: form })
  assert.equal(uploaded.data.status, 'Success')
})

test('missing multipart boundary is rejected and server remains usable', async () => {
  const before = await diskFiles()
  const { response, data } = await request('/upload-file', {
    method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: 'invalid'
  })
  assert.equal(response.status, 400)
  assert.match(data.error, /boundary/i)
  assert.deepEqual(await diskFiles(), before)
  assert.equal((await request('/admin-status')).response.status, 200)
})

test('truncated multipart data is rejected without leaked files or process failure', async () => {
  const before = await diskFiles()
  const { response, data } = await request('/upload-file', {
    method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=truncated', Cookie: 'isPublic=1' },
    body: '--truncated\r\nContent-Disposition: form-data; name="file"; filename="truncated.txt"\r\nContent-Type: text/plain\r\n\r\nunclosed'
  })
  assert.equal(response.status, 400)
  assert.match(data.error, /unexpected end|malformed/i)
  assert.deepEqual(await diskFiles(), before)
  assert.equal((await request('/admin-status')).response.status, 200)
})

test('aborted multipart request cleans temporary files and leaves the server responsive', async (t) => {
  const before = await diskFiles()
  const req = http.request(`${base}/upload-file`, {
    method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=aborted', Cookie: 'isPublic=1', 'Content-Length': '1000000' }
  })
  const closed = new Promise((resolve, reject) => {
    req.on('error', err => { if (err.code !== 'ECONNRESET') reject(err) })
    req.on('close', resolve)
  })
  t.after(() => req.destroy())
  req.write('--aborted\r\nContent-Disposition: form-data; name="file"; filename="aborted.txt"\r\nContent-Type: text/plain\r\n\r\npartial')
  // Abort only once the real diskStorage has opened a file, not merely a socket.
  for (let attempt = 0; attempt < 50; attempt++) {
    if ((await diskFiles()).length > before.length) break
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.equal((await diskFiles()).length, before.length + 1)
  req.destroy()
  await closed
  // Cleanup is asynchronous on the request's aborted event.
  for (let attempt = 0; attempt < 50; attempt++) {
    if (JSON.stringify(await diskFiles()) === JSON.stringify(before)) break
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.deepEqual(await diskFiles(), before)
  assert.equal((await request('/admin-status')).response.status, 200)
})

test('fields count-limit errors remove previously written multipart files', async () => {
  const before = await diskFiles()
  const form = upload('first-file', 'document', 'count-first.txt')
  form.append('document', new Blob(['second-file']), 'count-second.txt')
  const { response, data } = await request('/fields', { method: 'POST', headers: { Cookie: 'isPublic=1' }, body: form })
  assert.equal(response.status, 400)
  assert.equal(data.code, 'LIMIT_UNEXPECTED_FILE')
  assert.deepEqual(await diskFiles(), before)
})
