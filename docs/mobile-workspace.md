# Mobile file workspace

On screens narrower than 768px, file browsing takes priority:

- A single 65px header contains search, upload and more actions; the rest of the viewport is the independently scrollable file list.
- Search, refresh, settings, batch deletion and transfer details use dismissible bottom sheets. The native multi-file picker remains one tap away.
- Transfer details never consume file-list height, on mobile or desktop. Success records expire after 5 seconds; failure records after 12 seconds. Completed records can also be dismissed manually. Active/processing uploads never expire. The transfer sheet closes when its last record is removed.
- Closing a sheet does not cancel uploads. Cleanup timers are released on component unmount.

## File rows

- Each file shows a type icon, a lock badge when it needs a password, its size (on unless the user turned it off) and its upload time. Date folders show a relative day (今天 / 昨天 / weekday / date) and their file count.
- The `⋯` button per file offers open, download, copy link, copy link with the current password (locked files only) and delete. Delete is only offered where the server would allow it (admin, or locked files) and always asks for confirmation. Right-click on desktop still copies the link.
- Opening a locked file without admin rights or a saved password asks for the password first instead of landing on the server's 403 page.
- Search highlights matching names, shows an explicit empty state with a clear button, and on mobile keeps a visible "搜索「…」 · 清除" bar while filtering. `/` focuses the desktop search box; `Esc` clears it.

## Verification

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

Browser tests start a loopback-only Vite server using `tests/vite.e2e.config.ts`. This config ignores application environment files, has no API proxy and points exclusively at `/__test_api`. Playwright intercepts these requests with explicit test fixtures; it does not upload or delete production files.

The layout regression tests measure the **visible file scrollbar height / viewport height**, not the height of its parent panel. They enforce a ratio of at least 0.8, plus no document overflow, at 320×568, 360×640, 390×844, 430×932 and 767×1024. Screenshots and traces are generated under the ignored `test-results/` directory.
