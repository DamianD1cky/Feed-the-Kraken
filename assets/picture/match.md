# 美术资源对应关系

本文以 `assets/picture/` 当前文件名为准，记录卡片正反面、合成图层、规则枚举和前端运行时资源之间的对应关系。

## 1. 资源类型约定

| 文件命名           | 类型                     | 使用方式                           |
| ------------------ | ------------------------ | ---------------------------------- |
| `*_back.png`       | 最终背面                 | 可以直接显示                       |
| `*_face_*.png`     | 最终正面                 | 可以直接显示                       |
| `*_background.png` | 底图层                   | 仅用于合成，不应当作完整卡片       |
| `*_element_*.png`  | 透明装饰层               | 叠加在底图层上                     |
| `items_*.png`      | 物品、职位或状态正面图标 | 透明 PNG，可作为 UI 图标或卡面主体 |
| `id_card_*.png`    | 阵营身份正面图标         | 透明 PNG，可作为身份卡主体         |

两套已经具备完整正反面的卡组是：

1. 航行牌：1 张共用背面 + 3 张方向正面。
2. 邪教仪式牌：1 张共用背面 + 3 张仪式正面。

身份图和物品图当前只有正面主体，没有对应的完整卡片背面。

## 2. 航行牌

### 2.1 正反面配对

所有航行牌共用同一张背面：

- [航行牌背面](navigation_cards/navigation_card_back.png)：`navigation_card_back.png`

| 逻辑方向 | 规则阵营     | 正面文件                                                         | 共用背面                   | 当前承载的牌效             |
| -------- | ------------ | ---------------------------------------------------------------- | -------------------------- | -------------------------- |
| `east`   | 水手，蓝色   | [东方](navigation_cards/navigation_card_face_location_east.png)  | `navigation_card_back.png` | 醉酒、缴械                 |
| `west`   | 海盗，红色   | [西方](navigation_cards/navigation_card_face_location_west.png)  | `navigation_card_back.png` | 醉酒、美人鱼、望远镜、武装 |
| `north`  | 克拉肯，黄色 | [北方](navigation_cards/navigation_card_face_location_north.png) | `navigation_card_back.png` | 邪教起义                   |

方向正面只表达航向。具体牌效和数量由 `packages/shared/src/rules.ts` 定义，不能只根据图片推断。

### 2.2 航行牌合成图层

| 文件                                       | 用途                     |
| ------------------------------------------ | ------------------------ |
| `navigation_card_back_background.png`      | 背面海面、太阳和边框底图 |
| `navigation_card_back_element_ship.png`    | 背面帆船透明主体         |
| `navigation_card_back.png`                 | 已合成的最终背面         |
| `navigation_card_face_background.png`      | 正面海图和边框底图       |
| `navigation_card_face_element_compass.png` | 正面罗盘透明主体         |
| `navigation_card_face_location_east.png`   | 已合成的东方最终正面     |
| `navigation_card_face_location_west.png`   | 已合成的西方最终正面     |
| `navigation_card_face_location_north.png`  | 已合成的北方最终正面     |

合成关系：

```text
背面底图 + 帆船主体 + 标题文字 = navigation_card_back.png
正面底图 + 罗盘主体 + 方向指针 / 标题文字 = navigation_card_face_location_*.png
```

## 3. 邪教仪式牌

### 3.1 正反面配对

所有邪教仪式牌共用同一张背面：

- [邪教仪式牌背面](cult_cards/cult_card_back.png)：`cult_card_back.png`

| 规则枚举            | 中文名称     | 数量 | 正面文件                                           | 共用背面             |
| ------------------- | ------------ | ---: | -------------------------------------------------- | -------------------- |
| `conversion`        | 皈依         |    3 | [触手缠手](cult_cards/cult_card_face_infect.png)   | `cult_card_back.png` |
| `guns_stash`        | 邪教武器库   |    1 | [三把手枪](cult_cards/cult_card_face_guns.png)     | `cult_card_back.png` |
| `cult_cabin_search` | 邪教船舱搜查 |    1 | [三把放大镜](cult_cards/cult_card_face_detect.png) | `cult_card_back.png` |

代码中的仪式牌堆顺序与数量定义在 `createCultRitualDeck()` 中。图片本身不承担洗牌和数量逻辑。

### 3.2 邪教仪式牌合成图层

| 文件                                | 用途                       |
| ----------------------------------- | -------------------------- |
| `cult_card_back_background.png`     | 背面神殿、边框和克拉肯底图 |
| `cult_card_back_candle.png`         | 背面透明主体构图           |
| `cult_card_back_element_candle.png` | 触手蜡烛透明装饰层         |
| `cult_card_back.png`                | 已合成的最终背面           |
| `cult_card_face_background.png`     | 三种仪式共用的正面底图     |
| `cult_card_face_element_infect.png` | 皈依卡的触手缠手透明主体   |
| `cult_card_face_infect.png`         | 已合成的皈依最终正面       |
| `cult_card_face_guns.png`           | 已合成的武器库最终正面     |
| `cult_card_face_detect.png`         | 已合成的邪教搜查最终正面   |

`cult_card_back_candle.png` 与 `cult_card_back_element_candle.png` 都属于背面构图素材；游戏直接显示时应使用 `cult_card_back.png`，不能把中间图层当成最终背面。

## 4. 阵营身份卡

| 规则阵营 | 中文名称          | 正面主体                                   | 背面 |
| -------- | ----------------- | ------------------------------------------ | ---- |
| `sailor` | 水手              | [铁锚](id_cards/id_card_good.png)          | 暂缺 |
| `pirate` | 海盗              | [蒙面海盗与双刀](id_cards/id_card_bad.png) | 暂缺 |
| `cult`   | 邪教领袖 / 邪教徒 | [克拉肯徽记](id_cards/id_card_cult.png)    | 暂缺 |

当前实现使用 `sailor`、`pirate`、`cult` 三个阵营值。`cult_leader` 和 `cultist` 是角色层差异，现有美术暂时共用 `id_card_cult.png`。

这些文件是透明的身份正面主体，不是带边框和文字的完整卡面。后续如果补齐身份卡，应增加：

- 三种阵营的完整正面模板；
- 一张所有身份共用的背面；
- 邪教领袖与普通邪教徒是否共用正面的明确规则。

## 5. 物品、职位与状态卡

以下文件都是透明正面图标，当前没有统一背面：

| 文件                      | 图案         | 对应规则 / UI      | 当前前端导出        |
| ------------------------- | ------------ | ------------------ | ------------------- |
| `items_capital.png`       | 船舵         | 船长               | `/art/captain.webp` |
| `items_chief_officer.png` | 锚与月桂徽章 | 大副               | `/art/mate.webp`    |
| `items_handgun.png`       | 手枪         | 玩家枪数、叛变投入 | `/art/gun.webp`     |
| `items_detect.png`        | 放大镜       | 船舱搜查行动       | 未接入              |
| `items_lash.png`          | 鞭子         | 鞭笞行动           | 未接入              |
| `items_knife.png`         | 匕首         | 割舌行动           | 未接入              |
| `items_rest.png`          | 啤酒杯       | 下班状态           | 未接入              |

目前缺少独立的领航员徽章美术。`items_capital.png` 中的 `capital` 是历史命名，实际含义是 `captain`；在完成代码引用迁移前不要直接改名。

## 6. 非卡片资源

以下文件不参与正反面配对：

| 文件                           | 用途                     |
| ------------------------------ | ------------------------ |
| `harbor_with_cthulhu.png`      | 宽幅克拉肯港口场景       |
| `harbor_with_cthulhu_16-9.png` | 16:9 克拉肯港口场景      |
| `harbor_with_people.png`       | 宽幅有人港口场景         |
| `harbor_with_people_16_9.png`  | 16:9 有人港口场景        |
| `harbor_without_people.png`    | 无人港口场景             |
| `harbor_with_ship_gone.png`    | 船已离港场景             |
| `quick_map_reference.png`      | 六边形海图参考，不是牌面 |

## 7. 当前前端运行时映射

`scripts/prepare-assets.mjs`（`pnpm assets images`）将源图转换为 `packages/client/public/art/` 下的 WebP：

| 前端键                 | 运行时文件                                | 源文件                                       |
| ---------------------- | ----------------------------------------- | -------------------------------------------- |
| `art.harbor`           | `/art/harbor.webp`、`harbor-960.webp`     | `harbor_with_cthulhu_16-9.png`               |
| `art.warmHarbor`       | `/art/harbor-warm.webp`、`harbor-warm-800.webp` | `harbor_with_people_16_9.png`          |
| `art.secret`           | `/art/secret.webp`                        | `cult_cards/cult_card_back.png`              |
| `art.captain`          | `/art/captain.webp`                       | `items_cards/items_capital.png`              |
| `art.mate`             | `/art/mate.webp`                          | `items_cards/items_chief_officer.png`        |
| `art.gun`              | `/art/gun.webp`                           | `items_cards/items_handgun.png`              |
| `art.rest` / `detect` / `lash` / `knife` | `/art/{rest,detect,lash,knife}.webp` | `items_cards/items_{rest,detect,lash,knife}.png` |
| `art.ritual`           | `/art/ritual.webp`                        | `cult_cards/cult_card_face_infect.png`       |
| `art.cardBack`         | `/art/card-back.webp`                     | `navigation_cards/navigation_card_back.png`  |
| `cardArt.east/west/north` | `/art/card-{east,west,north}.webp`     | `navigation_cards/navigation_card_face_location_*.png` |
| `identityArt.sailor/pirate/cult` | `/art/id-{sailor,pirate,cult}.webp` | `id_cards/id_card_{good,bad,cult}.png` |
| `modelArt.ship`        | `/art/model-ship.webp`                    | `models/item_ship_fanon`（`pnpm render-models` 渲染） |
| `modelArt.tentacleFeed` | `/art/model-tentacle-feed.webp`          | `models/kraken_tentacle_three`，献祭格  |
| `modelArt.tentacleGoal` | `/art/model-tentacle-goal.webp`          | `models/kraken_tentacle_five`，克拉肯终点 |
| `modelArt.magnifier`   | `/art/model-magnifier.webp`               | `models/item_detect`，搜查格            |

物品图标目前用于航海指南与船员名册；领航员暂无独立美术，界面使用罗盘图标代替。

## 8. 新增卡片时的检查清单

1. 最终正面和最终背面使用相同画布尺寸与安全边距。
2. 文件名中的 `face` / `back` 只用于最终成品；图层必须带 `background` 或 `element`。
3. 独立主体保留 Alpha 通道，完整卡面保持不透明。
4. 在本文件补充「规则枚举 → 正面 → 背面」对应关系。
5. 如需网页使用，在 `scripts/prepare-assets.mjs` 和 `packages/client/src/labels.ts` 中同时补充映射。
6. 修改规则牌数量时同步核对 `packages/shared/src/rules.ts`，不要仅复制图片文件。
