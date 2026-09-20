# 险恶疑航 · Feed the Kraken

5–11 人熟人局 Web 桌游。服务端权威、逐玩家私密视图、游客身份恢复，使用仓库港口与卡牌素材。请配合外部语音。

当前为**简化海图核心规则版**：支持任命、叛变、航行、牌效、地图行动与邪教仪式；原版逐格箭头海图、22 张角色异能、进程重启恢复尚未实现。

## 文档入口

1. [架构与技术现状](docs/1_架构与技术现状.md)：实际技术栈、状态与事件、信息边界、架构优化顺序。
2. [规则与实现对照](docs/2_规则与实现对照.md)：原版依据、人数配置、已补规则和明确差异。
3. [开发与验证](docs/3_开发与验证.md)：环境、素材处理、多人测试与验收记录。

[原版规则 PDF](assets/准备/feed-the-kraken-rules.pdf) · [中文规则书](assets/准备/%23%20险恶疑航（Feed%20the%20Kraken）·%20中文规则书.md)

## 启动

推荐 Node.js 22.12+、pnpm 9。所有命令从仓库根目录执行：

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:5173`，服务端默认 `http://localhost:2567`。创建房间并分享房间号，其余玩家用「作为新玩家加入」，至少 5 人可开局。7 人可选快速或漫长航行。

本地多标签测试时，每个标签分别加入新玩家。页面断线可直接「恢复连接」，返回港口后可凭房间号「恢复上次身份」。活动标签用 `sessionStorage` 隔离；`localStorage` 仅保存同房间最后一次身份，关闭多个标签后无法分别找回全部玩家。

## 验证

```bash
pnpm typecheck
pnpm test
pnpm build
# 服务端运行时：
node scripts/smoke-game.mjs 5 quick
node scripts/smoke-game.mjs 11 long
```

## 素材与持久化

原始素材保留在 `assets/`，运行时只使用 `packages/client/public/art/` 的 WebP。需要重新生成时安装 `cwebp`，执行 `bash scripts/prepare-assets.sh`。

事件优先写入 `packages/server/data/kraken.sqlite`；原生模块不可用时降级到同目录 `events.jsonl` 并告警。JSONL 不保证掉电原子性。事件日志不等于可恢复房间：进程重启后目前无法恢复会话与进行中的对局。

默认令牌有效期 7 天，空房间保留 24 小时。环境变量与部署边界见开发文档。

Personal study project, not for distribution.
