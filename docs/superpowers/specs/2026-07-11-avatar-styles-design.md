# 头像风格设置 设计文档

日期：2026-07-11

## 目标

给配置面板加一个「头像风格」选择器，让主持人能挑更丰富的**默认生成头像风格**（不再只有"首字"一种），并在人数多、选了偏重风格时给出提示与可选的自动降级。**选择为主，按人数建议为辅。**

## 现状（改动前）

- 头像只有两个来源：`buildCards` 里 `avatar: person.avatar ?? generateAvatar(person.name)`。
  - `person.avatar`：名单里「名字,头像链接」或导入配置带的自带头像（每人可单独有）。
  - `generateAvatar(name)`：唯一生成款——纯色底 + 姓氏首字（`avatar.ts`）。
- 配置面板**没有**"选头像风格"的设置。

## 需求（已确认）

1. 配置面板新增「头像风格」区，可选：`letter`、`letter-rich`、`fun-emoji`、`bottts`。
2. **默认风格 = `fun-emoji`**（全局默认变更：老配置与内置默认名单更新后都从"首字"变成 emoji 脸，主持人接受此变更，可随时改）。
3. 每人自带头像链接的行为**不变**；本功能只管"没自带时的默认生成款"。
4. 选了 `heavy` 风格（bottts）且名单人数超阈值 → **黄字软提示**，不强制；另给**"大名单自动用轻量头像"开关**，主持人自行决定是否硬降级。
5. 风格随配置导出/导入。

## 非目标（YAGNI）

- **性别处理**：所选四个风格（首字/emoji/机器人）天然无性别，无需处理。
- **每人上传真实照片的 UI**：不做；保留现有"名单粘链接"方式。
- **按需懒加载 DiceBear**：选定静态内置（B 方案），不做代码分割。
- multiavatar 及其它 DiceBear 风格：本期不纳入。

## 设计

### 依赖与打包

- `pnpm add @dicebear/core @dicebear/collection`（v9）。
- **静态内置** `funEmoji`、`bottts` 两个风格 → 主包 **+~37KB gzip**（实测：core ~3.7KB + fun-emoji ~8.6KB + bottts ~25KB）。因默认即 fun-emoji，这 37KB 必然加载。已认可。

### 风格注册表 `src/views/lottery/core/avatar-styles.ts`（新增）

```ts
export interface AvatarStyle {
  id: string            // 'letter' | 'letter-rich' | 'fun-emoji' | 'bottts'
  label: string         // UI 中文名
  heavy: boolean        // 是否重（触发大名单提示/降级）
  generate: (name: string) => string   // → data URI，永不抛
}
```

- 注册表 `AVATAR_STYLES: AvatarStyle[]`，顺序即 UI 展示顺序：`fun-emoji`(默认) → `letter-rich` → `letter` → `bottts`。
- `DEFAULT_AVATAR_STYLE = 'fun-emoji'`；`LIGHT_FALLBACK_STYLE = 'letter-rich'`（降级目标）。
- `AVATAR_HEAVY_WARN = 500`（超过则重风格给提示/降级）。
- `letter`：沿用现有 `generateAvatar` 的实现（纯色底+首字）。
- `letter-rich`：零依赖——按名字 seed 的渐变底 + 一个几何点缀 + 首字（复用 brainstorm 阶段验证过的 SVG）。
- `fun-emoji` / `bottts`：`createAvatar(style, { seed: name, size: 96 }).toDataUri()`；**包 try/catch，异常兜底回 `letter`**。
- `generateAvatar(name, styleId = DEFAULT_AVATAR_STYLE)`：按 id 查注册表（找不到用默认）→ 调 `generate`。对外仍是「名字进 → data URI 出」，**永不抛**。

### 生效风格解析（纯函数，便于测）

```ts
export function resolveStyle(styleId: string, rosterSize: number, autoDowngrade: boolean): string
```

- 若 `autoDowngrade && 注册表[styleId].heavy && rosterSize > AVATAR_HEAVY_WARN` → 返回 `LIGHT_FALLBACK_STYLE`；否则返回 `styleId`（styleId 非法时返回默认）。

### 配置字段 `config-store.ts`

- `UserLotteryConfig` 增：`avatarStyle?: string`、`avatarAutoDowngrade?: boolean`。
- `isValidConfig` 放行：两者可选，类型分别为 string / boolean，非法则拒绝配置。
- 旧配置无这两字段 → 取默认（`fun-emoji` / `false`），行为符合"默认变更"预期。
- **不进 `configHash`**（头像本就排除在指纹外）→ 换风格保存**不清空抽奖进度**，只重建卡片（刷新）。

### 卡片构建 `lottery-config.ts` / `lottery-config-users.ts`

- `lottery-config.ts` 计算生效风格：
  ```ts
  const style = userConfig?.avatarStyle ?? DEFAULT_AVATAR_STYLE
  const auto = userConfig?.avatarAutoDowngrade ?? false
  const effectiveStyle = resolveStyle(style, people.length, auto)
  const { cardList, colCount, rowCount } = buildCards(people, effectiveStyle)
  ```
- `buildCards(people, styleId)`：`avatar: person.avatar ?? generateAvatar(person.name, styleId)`。

### 配置面板 UI `LotteryConfigPanel.tsx`（新「头像风格」区）

- state：`avatarStyle`（初值取当前配置或默认）、`avatarAutoDowngrade`。
- **风格选择器**：一排可选项，每项用**名单第一个名字**（名单空则用占位如「示」）现场 `generateAvatar(sample, style.id)` 生成小圆预览；点选即中（radio 语义，键盘可达，沿用本项目 a11y 约定）。
- **软提示**（`选中风格.heavy && rosterNames.length > AVATAR_HEAVY_WARN` 时，下方黄字，按开关状态两种文案）：
  - 开关**关**："当前 N 人用「机器人」头像可能卡顿，建议换轻量风格，或打开下方自动降级。"
  - 开关**开**："当前 N 人较多，抽奖时会自动改用轻量首字头像（面板里仍显示你选的风格）。"
- **开关**：勾选框「大名单自动用轻量头像」（`avatarAutoDowngrade`）。选择器始终显示主持人所选风格；降级只发生在实际建卡时（由 `resolveStyle` 决定）。
- `buildConfig()` 写入 `avatarStyle` + `avatarAutoDowngrade`；`handleSave` 持久化后刷新（进度保留，见上）。

### 错误处理

- `generateAvatar` 永不抛：DiceBear 生成失败 → 静默回 `letter`。
- 预览生成同样兜底，避免面板因单个风格出错白屏。

## 测试

- **单测 `avatar-styles.test.ts`**：
  - 每个风格 `generate('张三')` 返回非空、以 `data:` 开头的 URI。
  - `generateAvatar` 派发正确；非法 id 回默认。
  - `resolveStyle`：heavy+超阈值+开关 → 轻量；heavy 但未超阈值/未开开关 → 原样；非 heavy → 原样；非法 id → 默认。
  - DiceBear 生成抛错时兜底回 letter（mock 使其抛）。
- **E2E**（`lottery.spec.ts`）：
  - 开配置 → 选 `bottts` → 保存 → 卡片正常渲染 + 刷新后风格持久化。
  - 大名单（注入 >500 人配置）下选 bottts → 黄字提示出现。
  - 开「自动降级」开关 + 大名单 → 卡片实际用轻量款。**断言方式**：轻量 `letter-rich` 头像是内联 SVG data URI、含姓氏文字与 `linearGradient`；bottts 是 DiceBear 的 `viewBox="0 0 200 200"` 机器人 SVG。取第一张卡片 `.card-avatar` 的 `src`，断言它匹配 letter-rich 的特征（含 `linearGradient` / 首字）而非 bottts 特征。未开开关时反之。
- **回归**：改 DOM/选择器，提交前跑全套 E2E（本项目惯例）。

## 影响与风险

- 主包 +~37KB gzip（已认可）。
- 默认 fun-emoji：300+ 人名单会有可见撞脸（~1350 组合），主持人已知悉、可换。
- bottts 在千人名单偏重（实测 ~8.6MB/300ms 解码/旋转 fps 减半）——由软提示 + 可选自动降级兜住。

## 提交策略

按本项目规矩：一项一验一提交、端到端跑通再 commit。预计拆分：
1. 依赖 + 风格注册表 + resolveStyle + 单测。
2. config 字段 + buildCards 接线 + 单测。
3. 配置面板 UI + E2E。
