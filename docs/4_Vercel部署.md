# 4. Vercel 部署

当前项目不能全部运行在 Vercel：React / Vite 前端适合部署到 Vercel；Colyseus 服务端需要常驻 WebSocket、内存房间和可写磁盘，应部署到 Railway、Render、Fly.io 或自有服务器。

本文说明选择 Vercel 时的前后端拆分部署方式。面向大陆朋友局，建议先阅读 [部署方案选型](5_部署方案选型.md)，比较个人电脑按需开服与前后端同机的云主机方案；以下组合不作为默认推荐：

- Vercel：`packages/client`
- Railway：`packages/server`、`packages/shared` 与 SQLite 数据卷

## 1. 部署服务端到 Railway

先把仓库推送到 GitHub，然后：

1. 在 Railway 创建项目，选择 `Deploy from GitHub repo` 并连接本仓库。
2. 如果 Railway 自动识别出多个 workspace 服务，只保留服务端服务；不要部署前端服务。
3. 服务的仓库 Root Directory 保持 `/`。服务端依赖 `packages/shared`，不能只把 `packages/server` 作为孤立根目录。
4. Railway 会读取根目录 [`railway.json`](../railway.json)：
    - 构建：`pnpm --filter @feed/shared build && pnpm --filter @feed/server build`
    - 启动：`pnpm --filter @feed/server start`
    - 健康检查：`/api/health`
5. 在 Variables 添加：

```text
NODE_ENV=production
DATABASE_PATH=/data/kraken.sqlite
```

`PORT` 由 Railway 自动注入，不要手写。可按需添加：

```text
RECONNECT_SESSION_TTL_MS=604800000
ROOM_IDLE_TTL_MS=86400000
FTK_DEBUG=0
```

6. 给服务挂载 Volume，Mount Path 设置为 `/data`。没有数据卷时，SQLite / JSONL 会在重新部署后丢失。
7. 在 `Settings → Networking → Public Networking` 生成域名，例如：

```text
feed-the-kraken-server-production.up.railway.app
```

8. 保持 **1 个副本**，不要开启 Serverless / Scale to zero。当前房间和会话在单进程内存中，多副本会把玩家随机分配到不同进程，休眠或重启会直接丢失正在进行的房间。
9. 验证：

```bash
curl https://feed-the-kraken-server-production.up.railway.app/api/health
```

应返回 `"ok": true` 与当前协议版本。再检查部署日志；如果出现 `SQLite unavailable; using JSONL`，说明已经降级到 JSONL，应先解决 `better-sqlite3` 原生模块问题。

## 2. 部署前端到 Vercel

1. 在 Vercel 选择 `Add New → Project`，导入同一个 GitHub 仓库。
2. **Root Directory 保持仓库根目录 `.`，不要选择 `packages/client`**。Vercel 将 Root Directory 作为文件访问边界，而客户端构建依赖根目录 workspace 与 `packages/shared`。
3. 根目录 [`vercel.json`](../vercel.json) 已配置：
    - Framework：Vite
    - Install：`pnpm install --frozen-lockfile --filter @feed/client...`
    - Build：`pnpm --filter @feed/shared build && pnpm --filter @feed/client build`
    - Output：`packages/client/dist`
    - SPA fallback：所有前端路由回到 `index.html`
    - [`.vercelignore`](../.vercelignore) 排除约 589 MB 原始素材与服务端代码；运行时需要的 WebP 已保存在 `packages/client/public/art`
4. 在 `Settings → Environment Variables` 添加：

```text
VITE_SERVER_URL=wss://feed-the-kraken-server-production.up.railway.app
```

至少勾选 Production；需要 Vercel Preview 也连接后端时，同时勾选 Preview。`VITE_*` 是构建时变量，修改后必须重新部署。

5. 点击 Deploy。部署完成后打开 Vercel 域名创建房间。

Vercel 页面是 HTTPS，因此服务端地址必须是 `wss://`，不能使用 `ws://` 或 `http://`。`VITE_SERVER_URL` 只写域名根地址，不追加 `/matchmake`。

## 3. 自定义域名

推荐分成两个子域名：

```text
play.example.com  → Vercel
game.example.com  → Railway
```

随后把 Vercel 的变量更新为：

```text
VITE_SERVER_URL=wss://game.example.com
```

更新变量后重新部署前端。当前 Colyseus 默认跨域中间件会回显请求 Origin，本地已经验证 Vercel 来源的 OPTIONS / HTTP 跨域响应；不需要在 Vercel 增加反向代理。

## 4. 上线验收

至少执行：

1. Vercel 页面能创建房间。
2. 另一台设备能用房间号加入。
3. 至少 5 个浏览器身份可以开局并完成一次航行。
4. 刷新页面后可以恢复身份。
5. Railway 日志无 SQLite 降级、未捕获异常或反复重启。
6. Railway 重新部署后，确认旧房间会失效，并向实际玩家说明这一限制。

本地发布前检查：

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 5. 当前生产边界

- Railway 重启 / 发布会丢失正在进行的房间与会话；事件文件尚不能自动恢复房间。
- SQLite 只保存事件，不保存可恢复的房间快照和令牌状态。
- 当前架构只能运行单个服务端副本，不能水平扩容。
- Vercel Preview 若复用生产后端，会与正式站共享房间空间。
- 前端源码中的服务端 URL 是构建产物的一部分，不属于秘密。

若必须「全部只用 Vercel」，需要把 Colyseus、内存状态和本地 SQLite 改造成 Vercel 支持的实时服务与外部数据库。这是一次服务端架构迁移，不是部署配置调整，不建议在当前可玩版本上直接进行。
