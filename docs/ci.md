# 自动验证与手动发布

## 自动 CI

`.github/workflows/ci.yml` 在分支 push、指向 master 的 PR，以及手动运行时执行。使用 Node.js 22、pnpm 9.15.9 和两个独立的 frozen lockfile 安装。

自动检查包括：

- 前端单元测试、TypeScript 检查和 Vite 应用构建；
- 后端隔离 HTTP/上传回归、类型检查和应用构建；
- 前后端生产依赖审计（任意已知等级问题均阻断）；
- Chromium 浏览器回归：文件列表、移动布局、上传交互、PWA 安装入口、真实 service-worker 通知及离线隐私；
- 保存浏览器测试证据 7 天。

没有 Docker 镜像构建、镜像仓库登录/推送、生产服务器凭据或线上部署操作。浏览器使用独立构建配置和 fixtures；后端测试使用临时目录及 stub Redis，不接触线上文件、Redis 或数据库。

前端开发依赖的已知审计告警不在本脚本中忽略或伪装为零；完整审计仍可使用 `pnpm audit:security`，但当前 CI 的安全门禁限定为生产依赖。开发工具链告警需单独修复。

## 本地同一入口

```sh
npx --yes pnpm@9.15.9 install --frozen-lockfile
npx --yes pnpm@9.15.9 --dir service install --frozen-lockfile
npx --yes pnpm@9.15.9 run ci:verify
# 安装 Chromium 后运行浏览器测试；Linux 的系统依赖只在授权的测试机或 CI runner 安装。
npx --yes pnpm@9.15.9 exec playwright install chromium
npx --yes pnpm@9.15.9 run test:e2e
```

`ci:verify` 不调用 `start.mjs` 或 `build:docker`，不构建镜像。所有步骤遇到失败即停止，CI 不将测试失败作为可忽略告警。

## 镜像发布和部署

Docker 发布是独立的手动工作流，见 [手动镜像发布](docker-ci.md)。普通 push/PR 的验证通过不自动构建或发布镜像，更不自动改动生产服务。镜像构建/推送和部署需明确授权。
