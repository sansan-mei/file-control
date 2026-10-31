# files-control

mh33.top的子应用，文件云存储

## 桌面应用与系统通知

支持安装/添加到桌面，以及用户主动开启的后台上传完成/失败通知。入口位于「空间设置」；关闭应用后不提供 Web Push，下载由浏览器管理。安装、权限、离线隐私边界及本地测试见 [PWA 使用说明](docs/pwa.md)。

## 自动验证与发布

push 和 PR 会自动执行前后端测试、类型检查、应用构建、生产依赖审计及 Chromium 回归；本地统一入口为 `pnpm run ci:verify`。详见 [CI 说明](docs/ci.md)。Docker 镜像仍通过独立的[手动发布工作流](docs/docker-ci.md)发布，不自动部署。

## Project Setup

```sh
pnpm install
```

### Compile and Hot-Reload for Development

```sh
pnpm dev

cd service && pnpm dev
```

### Type-Check, Compile and Minify for Production

```sh
// edit docker-compose.yml and then
node start.mjs
```

### Lint with [ESLint](https://eslint.org/)

```sh
pnpm lint
```
