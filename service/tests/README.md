# Backend dependency verification

Run from `service/` with a supported Node.js LTS release (Node 22 or newer):

```sh
npx --yes pnpm@9 install --frozen-lockfile
npx --yes pnpm@9 test
npx --yes pnpm@9 type-check
npx --yes pnpm@9 build
npx --yes pnpm@9 audit --json
npx --yes pnpm@9 audit --prod --json
```

Tests use Node's test runner, real Express routers and Multer disk storage, a temporary
working directory under `TMPDIR`, and an HTTP listener bound to `127.0.0.1` on an OS-assigned
port. The test bundle aliases `#src/redis` to `fixtures/redis.ts` and asserts that neither
the production Redis module nor the Redis package enters its module graph. Do not replace
this with importing the application entry point: that entry point connects Redis and
listens on port 3003.

Coverage includes public and protected uploads/downloads, Unicode filenames, directory
listing, byte ranges, ETags, hard-link deduplication, admin status and batch deletion,
capacity reservations, `multer.fields()` hashing, malformed/truncated/aborted multipart
requests and count-limit cleanup. The Express proxy fixture verifies the patched
`proxy-addr` IPv4-mapped IPv6 trust-prefix behavior; it does not change the production
application's proxy configuration.

The build test runs only the build command and `node --check`; it never executes the
resulting service. The esbuild replacement preserves `build/index.mjs`, external runtime
dependencies and ESM/CommonJS compatibility. Docker's existing copy-to-runtime layout and
`prod` script are unchanged. Development now uses `tsx watch`; tsup, esno, rimraf and the
unused node-fetch runtime dependency have been removed. No dependency overrides or ignored
advisories are required.

The initial frozen dependency graph reproduced leaked temporary files and an uncaught
stream error for truncated multipart data, and leaked files for aborted requests. Multer 2
fixes these regressions. An independent test-first fix normalizes the `multer.fields()`
file-object shape before checking its length in the MD5 middleware.

Audit JSON and red/green execution evidence are deliberately kept outside the repository
in the parent task's scratch directory. No production service, Redis instance or deployed
files are touched by these commands.
