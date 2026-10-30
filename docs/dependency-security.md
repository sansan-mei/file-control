# Dependency security verification

This update addresses the frontend and backend manifests and both pnpm lockfiles. The starting GitHub dependency-alert snapshot contained 179 open alerts, including 7 critical alerts; GitHub alert counts are not interchangeable with pnpm's audit counts because manifest/lockfile entries and vulnerable paths are counted differently.

## Remediation

- Frontend: Vite 7.3.7, Vitest 4.1.12, Vue 3.5.44, Axios 1.21.0 and patched build-tool transitives. Updated Vue compiler tooling removes the vulnerable Vue 2 template compiler from the dependency graph. TypeScript 5.9.3 supports the updated plugin declarations; the removed Vitest `minWorkers` option is replaced by the existing `maxWorkers: 1` limit.
- Removed the old `npm-run-all` implementation and unused frontend `cookie-parser`; the existing maintained `npm-run-all2` runner is upgraded to 8.0.4.
- Two narrow frontend overrides are necessary: `mei-utils>axios` selects a patched Axios 1.x instead of the helper package's exact vulnerable 1.6.8 pin; `@typescript-eslint/typescript-estree>minimatch` selects patched 9.0.x instead of its exact vulnerable 9.0.3 pin. These replace vulnerable code, not audit findings. Existing HTTP/upload tests exercise the shared Axios instance.
- Backend: Multer 2.5.0, Express 4.22.3 and patched proxy-addr/body-parser/qs/path-to-regexp transitives. Removed unused node-fetch and obsolete tsup/esno/rimraf tooling; direct esbuild and tsx replace the build/development runners without changing the Docker artifact contract.
- A test-first compatibility correction normalizes `multer.fields()` file dictionaries before checking their length in the MD5 middleware. Existing array/single upload handling and hard-link deduplication remain intact.

No advisories are ignored or dismissed. The audit includes development dependencies, not only production dependencies. Some tooling emits deprecation notices (including the existing ESLint 8 line and CryptoJS); deprecation alone is not a security-audit finding, and a zero audit is not a guarantee that application code has no vulnerabilities.

## Reproduce

Use Node satisfying the root `engines` range and pnpm 9. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --dir service install --frozen-lockfile
pnpm audit:security
pnpm audit --prod
pnpm --dir service audit --prod
pnpm test
pnpm test:e2e
pnpm build
pnpm --dir service test
pnpm --dir service type-check
pnpm --dir service build
```

If pnpm is not installed globally, prefix commands with `npx --yes pnpm@9` rather than changing global package-manager configuration. Playwright needs its Chromium binary installed; test browser files may be kept in profile scratch with `PLAYWRIGHT_BROWSERS_PATH`.

## Verified locally

- Frontend all-dependency audit: 0 findings; production audit: 0 findings.
- Backend all-dependency audit: 0 findings; production audit: 0 findings.
- Frontend: 20 unit tests and 10 browser tests pass; type-check/build pass.
- Backend: 11 real HTTP/build regression tests pass; type-check/build pass. Multipart coverage includes normal uploads, malformed/truncated/aborted streams, field-count limits, MD5 deduplication, downloads, byte ranges, ETags and password/admin behavior.
- Both frozen-lockfile installations pass. No Docker image is built/pushed and no production service is restarted as part of verification.

Browser tests use only `/__test_api` fixtures. Backend tests use a temporary directory, loopback port 0 and an explicitly stubbed Redis module; they never start the production entry point or connect to the production database. See `service/tests/README.md` for backend isolation details.

The backend builder still emits `build/index.mjs`. The Dockerfile copies that directory's contents to `/app/`, and the production command remains `node ./index.mjs`. Deploying these dependency changes requires a separate image rebuild/redeployment; updating Git does not update an already-running container.
