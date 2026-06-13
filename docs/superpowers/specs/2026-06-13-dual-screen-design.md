# 双屏能力设计（展示屏 + 控制屏）

## 目标

年会现场用一台电脑接投影时，把界面拆成两个窗口：

- **展示窗**：投影到大屏，只显示 3D 抽奖、揭晓、星空，画面干净专业，无操作按钮。
- **控制窗**：留在主持人笔记本屏，做操作（选奖项、开始/停、看状态）。

让大屏展示更专业，主持人不必在投影画面上点按钮。

## 技术约束（关键）

纯前端项目（GitHub Pages 静态托管，无后端），因此：

- ✅ **同机双窗**：同一浏览器开两个同源窗口，用浏览器原生 **BroadcastChannel** 实时通信，零后端。
- ❌ **跨设备**（两台不同电脑）：需要服务器中转（WebSocket/WebRTC 信令），本项目无后端，**不在本设计范围**。年会现场最常见的"一台电脑接投影"正是同机双窗场景。

确认场景：一台电脑接投影/扩展屏。

## 架构：执行端 + 遥控器

核心原则：**抽奖逻辑（种子状态、lotteryConfig、3D、持久化）只能在一个窗口运行**，否则两窗的随机种子会分叉，破坏可验证公平。因此采用单一权威：

| | 展示窗（执行端 / authority） | 控制窗（遥控器） |
|---|---|---|
| 抽奖逻辑 | ✅ 跑 getRandomCard / rng / 3D / 持久化 | ❌ 不跑，不用本地 lotteryConfig 做权威 |
| 角色 | 唯一真实状态源 | 纯镜像 + 发命令 |
| 通信 | 接收命令、广播状态 | 发命令、渲染广播来的状态快照 |

数据流单向、不冲突：

```
控制窗 ──命令(selectPrize/start/stop)──▶ 展示窗（执行）
控制窗 ◀──状态快照(广播)────────────── 展示窗（每次状态变化）
```

### 备选方案与否决理由

- **对等同步**（两窗都能操作、双向合并状态）：否决。冲突难处理；两窗各跑抽奖会让随机种子分叉，破坏可验证公平。
- **localStorage + storage 事件**：可行但语义绕；BroadcastChannel 是为同源多窗通信而生，更直接。

## 通信协议

频道：`new BroadcastChannel('lottery-3d-sync')`

消息两类：

```ts
// 控制窗 → 展示窗
{ kind: 'command', action: 'selectPrize' | 'start' | 'stop' | 'requestState', payload?: { prizeId?: string } }

// 展示窗 → 控制窗
{ kind: 'state', snapshot: StateSnapshot }
{ kind: 'heartbeat', at: number }
```

状态快照（展示窗权威数据的只读投影）：

```ts
interface StateSnapshot {
  headerTitle: string
  prizes: { id: string; name: string; count: number; countRemain: number; round: number }[]
  currentPrizeId: string | null
  spinning: boolean
  lastReveal: { prizeName: string; winnerNames: string[] } | null
}
```

### 广播时机（展示窗）

- 收到 `requestState`（控制窗握手）→ 立即回发完整快照
- `notifyLotteryChange`（已有 store：奖项剩余/中奖变化）→ 广播快照
- `spin-change`（开始/停旋转）→ 广播快照
- `lottery-win-reveal`（揭晓）→ 广播快照（带 lastReveal）
- 心跳：每 3 秒 `heartbeat`，让控制窗判断展示窗在线

### 命令执行（展示窗）

控制窗命令映射到现有 controller / config：

- `selectPrize` → 设置 `lotteryConfig.currentPrize`（需从 LotteryPrize 的点击逻辑抽出一个 `selectPrize(id)` 函数复用）
- `start` → `lotteryStart()`
- `stop` → `lotteryStop()`

均为已有逻辑，只是新增"由 channel 命令触发"这一入口。

## 入口与模式

- URL 区分：无参数（或 `?mode=display`）= 展示窗（现有主界面）；`?mode=control` = 控制窗。
- 展示窗 HUD 加"双屏"按钮 → `window.open('?mode=control', 'lottery-control', 'width=460,height=720')` 弹出控制窗。
- 主持人手动把展示窗拖到投影屏并全屏（F 键已支持）。

### 展示窗自动精简

控制窗连上（收到命令或握手）后，展示窗**自动隐藏操作区与多余 HUD**（操作交给控制窗了），投影画面只剩 3D 球+揭晓+星空+标题。控制窗断开（心跳超时）则恢复显示，保证单窗仍可用。

## 容错

- 控制窗顶部显示"● 已连接 / ○ 展示窗已断开"，基于心跳超时（如 8 秒无心跳判定断开）。
- 展示窗关闭 → 控制窗提示断开、命令置灰。
- 控制窗关闭 → 展示窗恢复完整 UI，照常单窗操作。
- **双屏是叠加能力，不破坏现有单窗用法**：不开控制窗时一切如旧。

## 模块划分

- `core/lottery-sync.ts`：BroadcastChannel 封装 + 消息协议 + 收发分发 + 心跳。纯逻辑，可单测（mock channel）。
- `core/lottery-snapshot.ts`：从 lotteryConfig 构建 StateSnapshot 的纯函数，可单测。
- `components/LotteryControl.tsx`：控制窗视图（遥控器 UI）。
- `components/LotteryControl.scss`。
- 展示窗接线：在现有 Lottery 容器里挂 sync（监听命令、广播状态、按连接态切换"展示模式" class）。
- `main.tsx` / `App.tsx`：按 `?mode=control` 路由渲染 LotteryControl 或现有 Lottery。

## 控制窗 MVP 范围（核心遥控）

第一版只做最高频操作：

- 奖项列表，每项显示「名称 + 剩余 X/Y」，可点选（高亮当前选中）
- 大号「开始抽奖 / 停！」按钮，镜像 spinning 态切换文案（与展示窗联动）
- 最近一轮中奖名单展示
- 顶部连接状态指示

**不做**（留展示窗本地或后续迭代）：撤销、作废补抽、改配置、看完整历史、海报导出。这些低频或复杂，第一版不进遥控器，避免命令链路复杂化、降低首版风险。

## 测试策略

- `lottery-snapshot` 纯函数：单测（给定 lotteryConfig → 期望快照）。
- `lottery-sync` 协议：单测，mock BroadcastChannel，验证命令/状态收发与分发、心跳、连接判定。
- 双窗 E2E：Playwright 开两个 page（同 context 同源），控制窗发命令 → 展示窗执行 → 状态回传控制窗，验证端到端联动。

## 不做的（YAGNI）

- 跨设备同步（需后端）。
- 控制窗承载全部功能（首版只核心遥控）。
- 多控制窗、多展示窗（一对一即可）。
- 鉴权/加密（同机同源、本地场景，无需要）。
