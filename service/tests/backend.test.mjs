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
  assert.equal(download.headers.get('etag'), `"${file.key}"`)
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
  assert.match(data.message, /boundary/i)
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
  assert.match(data.message, /unexpected end|malformed/i)
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
  assert.equal(data.status, 'Fail')
  assert.equal(data.data.code, 'LIMIT_UNEXPECTED_FILE')
  assert.deepEqual(await diskFiles(), before)
})

async function uploadAs(cookie, body, filename, headers = {}) {
  return request('/upload-file', { method: 'POST', headers: { Cookie: cookie, ...headers }, body: upload(body, 'file', filename) })
}

async function findLeaf(label) {
  const tree = await request('/directory-tree')
  return leaves(tree.data.data).find(file => file.label === label)
}

async function sandboxFiles() {
  return (await readdir(sandbox, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile()).map(entry => join(entry.parentPath ?? entry.path, entry.name)).sort()
}

test('file passwords cannot place uploads outside the storage directory', async () => {
  const before = await sandboxFiles()
  for (const filePwd of ['../../escape', '..\\..\\escape', 'a/b']) {
    const cookie = `isPublic=0; filePwd=${encodeURIComponent(filePwd)}`
    const { response, data } = await uploadAs(cookie, 'escape-body', 'escape.html')
    assert.equal(response.status, 400)
    assert.equal(data.status, 'Fail')
    assert.equal(data.message, '文件密码不能包含 / 或 \\')
    // Routes without the guard still hit the storage-level check.
    const fields = await request('/fields', { method: 'POST', headers: { Cookie: cookie }, body: upload('escape-body', 'document', 'escape.html') })
    assert.equal(fields.response.status, 400)
    assert.equal(fields.data.message, '文件密码不能包含 / 或 \\')
  }
  assert.deepEqual(await sandboxFiles(), before)
})

test('passwords containing - or # protect, list, download and delete consistently', async () => {
  const password = 'a-b#c'
  const cookie = `isPublic=0; filePwd=${encodeURIComponent(password)}`
  assert.equal((await uploadAs(cookie, 'dash-body', 'dash.txt')).data.status, 'Success')
  const file = await findLeaf('dash.txt')
  assert.ok(file, 'label must not be cut at the first - of the password')
  assert.equal(file.locked, true)
  const denied = await fetch(`${base}/check-file/${file.key}/dash.txt`)
  assert.equal(denied.status, 403)
  await denied.text()
  const allowed = await fetch(`${base}/check-file/${file.key}/dash.txt/${encodeURIComponent(password)}`)
  assert.equal(await allowed.text(), 'dash-body')
  const wrong = await request(`/delete-file?hash=${file.key}`, { method: 'DELETE', headers: { Cookie: 'filePwd=a' } })
  assert.equal(wrong.data.message, '密码错误')
  const deleted = await request(`/delete-file?hash=${file.key}`, { method: 'DELETE', headers: { Cookie: cookie } })
  assert.equal(deleted.data.message, '删除成功')
  assert.equal(await findLeaf('dash.txt'), undefined)
  const missing = await request(`/delete-file?hash=${file.key}`, { method: 'DELETE', headers: { Cookie: cookie } })
  assert.equal(missing.data.status, 'Fail')
  assert.equal(missing.data.message, '文件不存在')
})

test('stored-name parsing keeps the historical format for public, protected and manual files', () => {
  const { parseStoredName } = fixture
  assert.deepEqual(parseStoredName('1730000000000-report.pdf'), { password: null, label: 'report.pdf' })
  assert.deepEqual(parseStoredName('1730000000000-a#1730000000001-b.txt'), { password: null, label: 'a#1730000000001-b.txt' })
  assert.deepEqual(parseStoredName('secret#1730000000000-report.pdf'), { password: 'secret', label: 'report.pdf' })
  assert.deepEqual(parseStoredName('#1730000000000-empty.txt'), { password: '', label: 'empty.txt' })
  assert.deepEqual(parseStoredName('x-y#1730000000000-z.txt'), { password: 'x-y', label: 'z.txt' })
  assert.deepEqual(parseStoredName('order-marker.txt'), { password: null, label: 'marker.txt' })
  assert.deepEqual(parseStoredName('pw#legacy-name.txt'), { password: 'pw', label: 'name.txt' })
})

test('downloads are sandboxed, correctly cached and keep stable share keys', async () => {
  assert.equal((await uploadAs('isPublic=1', '<script>alert(1)</script>', 'page.html')).data.status, 'Success')
  const page = await findLeaf('page.html')
  const path = (await diskFiles()).find(candidate => candidate.endsWith('-page.html'))
  const { realpath } = await import('node:fs/promises')
  assert.equal(page.key, createHash('sha256').update(await realpath(path)).digest('hex'), 'share keys stay SHA-256 of the absolute path')
  const html = await fetch(`${base}/check-file/${page.key}/页面 (1).html`)
  assert.equal(html.status, 200)
  assert.match(html.headers.get('content-type'), /^text\/html; charset=utf-8/)
  assert.equal(html.headers.get('content-security-policy'), 'sandbox')
  assert.equal(html.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(html.headers.get('cache-control'), 'public, max-age=604800')
  assert.equal(html.headers.get('content-disposition'), `inline; filename="__ (1).html"; filename*=UTF-8''%E9%A1%B5%E9%9D%A2%20%281%29.html`)
  await html.text()

  assert.equal((await uploadAs('isPublic=1', 'png-bytes', 'image.png')).data.status, 'Success')
  const image = await fetch(`${base}/check-file/${(await findLeaf('image.png')).key}/image.png`)
  assert.equal(image.headers.get('content-type'), 'image/png')
  assert.equal(image.headers.get('content-security-policy'), null)
  await image.text()

  assert.equal((await uploadAs('isPublic=0; filePwd=pw', 'private', 'private.txt')).data.status, 'Success')
  const privateFile = await findLeaf('private.txt')
  const privateResponse = await fetch(`${base}/check-file/${privateFile.key}/private.txt/pw`)
  assert.equal(privateResponse.headers.get('cache-control'), 'private, max-age=604800')
  await privateResponse.text()
  // A cached validator must not bypass the password check.
  const revalidate = await fetch(`${base}/check-file/${privateFile.key}/private.txt`, { headers: { 'If-None-Match': `"${privateFile.key}"` } })
  assert.equal(revalidate.status, 403)
  await revalidate.text()
  // Validators cached before ETags were quoted still match.
  for (const tag of [page.key, `"${page.key}"`, `W/"${page.key}"`]) {
    const cached = await fetch(`${base}/check-file/${page.key}/page.html`, { headers: { 'If-None-Match': tag } })
    assert.equal(cached.status, 304, tag)
  }
  const unknown = await fetch(`${base}/check-file/${'0'.repeat(64)}/x.txt`)
  assert.equal(unknown.status, 404)
  await unknown.text()
})

test('byte ranges handle suffix, open-ended, invalid and unsatisfiable requests', async () => {
  const body = '0123456789'
  assert.equal((await uploadAs('isPublic=1', body, 'range.txt')).data.status, 'Success')
  const { key, locked, uploadedAt } = await findLeaf('range.txt')
  assert.equal(locked, false)
  assert.ok(Math.abs(uploadedAt - Date.now()) < 60_000, 'upload time comes from the stored name')
  const get = range => fetch(`${base}/check-file/${key}/range.txt`, { headers: { Range: range } })
  const suffix = await get('bytes=-3')
  assert.equal(suffix.status, 206)
  assert.equal(suffix.headers.get('content-range'), 'bytes 7-9/10')
  assert.equal(await suffix.text(), '789')
  const open = await get('bytes=8-')
  assert.equal(await open.text(), '89')
  const clamped = await get('bytes=5-999')
  assert.equal(clamped.headers.get('content-range'), 'bytes 5-9/10')
  assert.equal(await clamped.text(), '56789')
  const invalid = await get('bytes=5-2')
  assert.equal(invalid.status, 200)
  assert.equal(await invalid.text(), body)
  const unsatisfiable = await get('bytes=10-')
  assert.equal(unsatisfiable.status, 416)
  assert.equal(unsatisfiable.headers.get('content-range'), 'bytes */10')
  await unsatisfiable.text()
})

test('upload endpoint enforces the storage limit and a declared size', async () => {
  const before = await diskFiles()
  process.env.MAX_STORAGE_BYTES = '1'
  try {
    const { response, data } = await uploadAs('isPublic=1', 'over-quota', 'quota.txt')
    assert.equal(response.status, 400)
    assert.equal(data.message, '占用超出上限')
  } finally {
    delete process.env.MAX_STORAGE_BYTES
  }
  const chunked = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/upload-file`, {
      method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=chunked', Cookie: 'isPublic=1' }
    }, res => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(text) }))
    })
    req.on('error', reject)
    req.write('--chunked\r\n')
    req.end()
  })
  assert.equal(chunked.status, 411)
  assert.equal(chunked.data.message, '缺少上传大小')
  assert.deepEqual(await diskFiles(), before)
})

test('listing the directory does not re-read file contents', async (t) => {
  const fs = require('node:fs')
  const body = `hash-once-${Date.now()}`
  const folder = join(sandbox, 'src/static/hash-once')
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, '1730000000000-hash-once.txt'), body)
  await request('/directory-tree')
  const hash = createHash('md5').update(body).digest('hex')
  for (let attempt = 0; attempt < 50 && !fixture.md5FileMap.has(hash); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.ok(fixture.md5FileMap.has(hash), 'new files are still indexed for deduplication')
  assert.equal((await findLeaf('hash-once.txt')).uploadedAt, 1730000000000)
  const reads = t.mock.method(fs, 'createReadStream')
  await request('/directory-tree')
  await request('/directory-tree')
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(reads.mock.callCount(), 0)
})

test('request logging redacts URL passwords', () => {
  assert.equal(fixture.redactUrl('/api/check-file/abc/name.txt/secret?x=1'), '/api/check-file/abc/name.txt/***?x=1')
  assert.equal(fixture.redactUrl('/api/check-file/abc/name.txt'), '/api/check-file/abc/name.txt')
})
