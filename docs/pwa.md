# 桌面应用与传输通知

## 使用

- 桌面「设置」或移动端「更多文件操作 → 空间设置」中提供安装与通知控制，不占用文件列表区域。
- Chromium 等浏览器出现安装事件时可点「添加到桌面」。没有安装事件时，使用浏览器菜单；iPhone/iPad 在 Safari「分享 → 添加到主屏幕」。安装事件完成或以 standalone 模式启动时显示「已添加到桌面」。安装被取消后可使用浏览器菜单重试。
- 系统通知默认关闭；只有主动点「开启传输通知」才会申请权限。可在同一位置关闭；拒绝后必须在浏览器网站权限中手动允许。浏览器/系统禁止通知时可能无法送达。
- 通知仅针对本页面发起的**上传**，包括权限预检查失败、上传失败和服务器确认成功。800ms 内的后台结果合并，任务 ID 去重，通知不携带文件名、路径、密码或错误详情；同一通知标签替换上一条结果，避免刷屏。前台只保留原有 toast，不额外弹系统通知。
- 点击通知只打开本站根路径，优先聚焦已有文件应用窗口；绝不跳到通知 data 中的任意地址，也不复用私有文件下载页面。

## 明确限制

这不是 Web Push。没有 push 订阅接口、VAPID 密钥、推送服务器或匿名推送后端。只有页面仍存活、上传回调能够继续运行，且页面不可见或失去焦点时，才调用实际 `ServiceWorkerRegistration.showNotification()`。关闭页面/应用后不会收到新传输通知；移动系统可能冻结后台页面、暂停或中断上传，不能保证后台传输。iOS 的通知还受系统版本（16.4+）、主屏幕安装和系统权限限制，需真机验收。

下载仍由原有浏览器/新窗口接管，网页无法可靠观察原生下载完成/失败，因此不伪造下载完成通知；系统/浏览器自身管理下载提醒。现有传输记录仍按原规则成功 5 秒、失败 12 秒自动移除，通知不存储完整传输历史。

安装入口依赖浏览器政策和用户选择；自动化测试模拟安装事件验证入口，不代表已向测试主机安装桌面快捷方式。系统通知浏览器测试验证真实 SW 通知记录，最终 OS 横幅显示及桌面图标需用户在实际设备上确认。

## 缓存与安全边界

- 仅以固定白名单缓存 192/512/maskable PNG 图标和 SW 内部生成的通用离线文档。离线文档不从网络取 HTML，避免登录代理返回认证页面而误缓存。
- 图标预缓存不带凭据、禁止重定向，拒绝失败、类型错误及 `private` / `no-store` 响应。没有运行时写缓存逻辑。
- 仅无查询参数的同源 GET 白名单资源，和根路径 `/` 导航，由 SW 处理。根导航只在网络失败时返回通用离线文档，**从不缓存应用首页 HTML**。
- API、目录、上传、下载、私有文件、认证 URL、带任何查询参数的 URL、跨域及非 GET 请求均不由 SW 缓存。离线不能浏览旧文件列表或传输文件。
- HTTPS（本地回环测试除外）及正常静态资源 MIME 类型是前提。应用部署于站点根路径：manifest `id/scope/start_url` 均为 `/`；子目录部署需要同时调整这些字段、SW 注册和所有公共资源路径。
- 服务端须将 `/sw.js`、`/manifest.webmanifest`、`/icons/*.png` 正确作为公共静态文件提供，不能返回 SPA HTML；建议 `sw.js` 使用重新验证的缓存策略。未修改代理、Docker 或线上服务配置。
- 更新时不强制 `skipWaiting()`，不打断当前上传；关闭旧应用窗口并重新打开后启用新 worker。修改离线文档/白名单缓存资源时递增 `file-control-public-v*`；仅清理此应用命名空间的旧缓存。

## 本地验证

```sh
npx --yes pnpm@9 install --frozen-lockfile
npm test
npm run type-check
npm run build-only
PLAYWRIGHT_BROWSERS_PATH=/root/.hermes/profiles/tg/cache/scratch/playwright-browsers npm run test:e2e
npx --yes pnpm@9 --dir service test
npx --yes pnpm@9 --dir service type-check
npx --yes pnpm@9 --dir service build
```

浏览器测试构建 `tests/vite.e2e.config.ts` 的隔离生产包并预览，忽略应用 env、无生产代理，只使用 `/__test_api` fixtures；单 worker。使用 `channel: 'chromium'` 的完整新 headless 浏览器：默认 headless shell 在此环境会把 `Notification.permission` 固定为 denied，无法验证真实通知。测试关闭 Playwright 强制焦点模拟后验证后台路径。

## 图标设计与再生成

图标参考 2FA 的简洁、高对比几何语言：暖白底、石墨色文件夹、低饱和蓝色叠层纸张，不使用文字、外框或烘焙圆角。192/512 PNG、Android maskable、180px Apple touch icon 以及 16/32/48 favicon 使用同一套原创图形。完整方形不透明背景交由系统裁切，主体位于中央直径 80% 的安全圆内，避免圆形或圆角方形桌面裁切截断文件夹。

```sh
# 仅开发时需要 Pillow；不增加应用运行/构建依赖。
python scripts/generate-pwa-icons.py
```

修改图标后同步递增 `public/sw.js` 中的缓存版本；本次为 `file-control-public-v2`。不会强制刷新或中断正在进行的上传。关闭所有旧应用窗口/标签页后重新打开，新的 worker 才能接管。已安装的桌面图标由浏览器/系统自行更新，不能保证即时生效；如果系统长期保留旧图标，可移除桌面入口后重新添加（不要清除网站数据）。尚未验证真实手机或操作系统桌面的图标更新行为。
