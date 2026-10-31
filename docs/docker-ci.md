# 手动构建并发布镜像

工作流 `.github/workflows/docker-publish.yml` 仅支持 GitHub Actions 的手动运行（`workflow_dispatch`），不会在 push 或 PR 时自动构建。

- 运行分支必须是仓库默认分支 `master`。
- 需要仓库 Secret `DOCKERHUB_TOKEN`，对应 Docker Hub 用户 `1596944197`；缺失时直接失败，不将“未发布”误报为成功。
- GitHub 托管 runner 构建 `linux/amd64`，检查镜像里的服务语法、前端及 PWA 静态文件后，推送 `1596944197/file-server:latest` 和 `1596944197/file-server:sha-<完整提交SHA>`。
- 构建、打包检查不连接生产 Redis、数据库或文件存储。
- 不执行线上部署或容器重启。部署方需核验 workflow 的目标提交和成功状态，再按提交标签/镜像摘要拉取，并仅更新文件服务，保留数据挂载和回滚镜像。
- 生产机不进行本地镜像构建。

在 GitHub Actions 页面选择 **Manual Docker build and publish → Run workflow → master**，或显式执行：

```sh
gh workflow run docker-publish.yml --repo sansan-mei/file-control --ref master
```

手动触发工作流属于镜像构建操作；需有用户对本次远端构建发布的明确授权，不能把代码合并或普通测试授权当作构建授权。
