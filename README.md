# files-control

mh33.top的子应用，文件云存储

## Docker CI

GitHub Actions 可自动构建并推送 `1596944197/file-server`；主分支发布需要仓库 Secret `DOCKERHUB_TOKEN`。功能分支和 PR 只构建，不推送，也不自动部署。配置、验证范围和手动运行方式见 [Docker CI 文档](docs/docker-ci.md)。

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
