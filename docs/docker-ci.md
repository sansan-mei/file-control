# Docker 构建与发布

工作流 `.github/workflows/docker-publish.yml` 在 GitHub 托管 Ubuntu runner 上构建现有 Dockerfile，仓库根目录为上下文，目标平台为 `linux/amd64`，镜像沿用 Compose 中的 **`1596944197/file-server`**。

## 触发与凭据

- push 到 `master`：完整构建并离线检查；配置 `DOCKERHUB_TOKEN` 时，登录 Docker Hub 用户 `1596944197`，推送 `sha-完整提交SHA` 和 `latest` 两个标签。
- `master` 上的手动 `workflow_dispatch`：同上。只添加 Secret 不会触发运行，可在 Actions 页面手动运行。
- push 到 `ci/docker-publish` 或面向 `master` 的 PR：只构建和检查，不登录、不推送，即使仓库已配置令牌。
- 缺少令牌时给出 warning，只验证构建；错误或权限不足的令牌会令登录/推送失败，不静默报告发布成功。

在仓库 Settings → Secrets and variables → Actions 添加 `DOCKERHUB_TOKEN`，使用有 `1596944197/file-server` 写权限的 Docker Hub 访问令牌。用户名固定，无需用户名 Secret；不得把令牌提交到代码或发到聊天。

Actions 固定完整提交 SHA，只授予 `contents: read`，不使用 `pull_request_target`。BuildKit 使用镜像专用缓存；主分支发布不会因新提交中途取消。两个标签的推送不是事务，失败时需检查标签后重试。

## 验证范围

先构建并加载 `file-server:ci`，再用断网的一次性容器检查 `index.mjs` 语法、前端页面和静态目录，以及运行镜像不含 `.env`。通过后才登录并推送**同一个已检查镜像**，不重新构建。此项不是应用端到端或 Redis 连通性测试；不访问生产 Redis、数据目录或任何平台接口。

根 `.env` 仅存放现有 `VITE_` 前端公开构建配置，沿用现有 API 地址；它会进入浏览器资源，不能放秘密。`service/.env`、其他环境文件、私钥、依赖目录及历史产物应排除在构建上下文外；后端配置继续运行时注入，不把生产配置传入 Actions。

本工作流**不部署、不拉取生产镜像、不重启服务**。CI 成功后还需核对 Docker Hub 上标签及摘要，才能认定发布完成；生产升级应另行审批。
