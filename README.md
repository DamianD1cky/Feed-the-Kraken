# 险恶疑航（Feed the Kraken）Web MVP

朋友局自用的 Web 桌游骨架：服务端权威、按玩家投射 `PlayerView`、断线可恢复。目标是 4 周内达到可完整打一局（v0.2），当前为简化规则闭环。

## 要求

- Node.js 20+
- pnpm 9+

## 启动

```bash
pnpm install
pnpm --filter @feed/server dev   # http://localhost:2567
pnpm --filter @feed/client dev   # http://localhost:5173
```

或根目录：

```bash
pnpm dev
```

## 本地多人联调

1. 浏览器打开多个**标签页**（会话存在 `sessionStorage`，按标签隔离）。
2. 一页点「创建房间」，把房间号发给其他页。
3. 其他页用「作为新玩家加入」。
4. 凑齐至少 5 人后，房主开始游戏。
5. 断线后在同一标签页用「恢复上次身份」重连（会轮换 token）。

不建议依赖无痕窗口以外的「同浏览器共用 localStorage」旧行为；旧 key 会在写入时清掉。

## 常用命令

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 事件落库

- 优先 SQLite：`packages/server/data/kraken.sqlite`（需 `better-sqlite3` 原生模块可用）。
- 不可用时回退 JSONL：`packages/server/data/events.jsonl`，启动日志会打印警告。

启用 SQLite（若被 pnpm 拦住 native build）：

```bash
pnpm approve-builds
# 勾选 better-sqlite3 后重新 pnpm install
```

## 当前范围

已有：

- 按人数阵营配比（含 5 人局随机袋）
- **5–6 人快速航行**（19 张牌）/ **7+ 人漫长航行**（23 张牌，含武装）
- 任命、叛变、航行选牌、跳船、下班
- 牌效：醉酒 / 缴械 / 美人鱼 / 望远镜 / 邪教起义 / **武装**
- 地图：船舱搜查、喂食克拉肯；漫长另含 **鞭笞、割舌**
- 漫长 **补给线**（越过后续补枪至 3）
- 邪教仪式：皈依 / 武器库 / 邪教船舱搜查

后置：22 张角色异能、Docker/Caddy、LiveKit、美术与 PWA。
