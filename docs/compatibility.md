# 浏览器兼容性

本文记录 lottery-3d 用到的现代 Web API、它们的兼容性风险，以及项目是如何降级处理的。

## 一句话结论

- **核心抽奖**（3D 球、配置、名单、开始/停、作废/撤销、进度保存）在 **2020 年之后的任何主流浏览器**都能正常用，不依赖任何高风险 API。
- **全部功能完整可用**需要：**Chrome / Edge 92+、Firefox 95+、Safari 15.4+**，且用 **HTTPS 或 localhost** 访问。
- 不满足上述条件时（老浏览器、`file://` 双击打开、内网 HTTP 部署），**核心抽奖照常工作**，只有部分增强功能降级或不可用，且启动时会**温和提示**用户，不阻断使用。

## 两个风险维度

兼容性风险来自两个独立维度，搞清楚它们就能判断某个功能是否可用：

1. **是否 secure context（安全上下文）** —— 即是否通过 **HTTPS 或 localhost** 访问。
   `file://` 双击打开本地文件、或内网 **HTTP（非 localhost）** 部署都**不是** secure context。
   受影响：`crypto.subtle`、`crypto.randomUUID`、剪贴板。
2. **浏览器版本是否够新** —— 主要卡在 **Safari 15.4（2022 年 3 月）**。
   受影响：`BroadcastChannel`（双屏）、`crypto.randomUUID`。

> 线上版本（GitHub Pages）是 HTTPS，用现代浏览器访问 → 两个维度都满足 → 全功能可用。
> 风险只发生在「把它下载下来本地打开」「内网 HTTP 部署」「用很老的浏览器」这三种场景。

## API 兼容性与降级一览

| 用到的 API | 支撑的功能 | 要求 | 不满足时的降级 |
| --- | --- | --- | --- |
| CSS3D transform | 3D 卡片墙（核心） | 任何现代浏览器 | 无需降级，是核心前提 |
| `localStorage` | 配置、抽奖进度 | 广泛支持 | 写入失败（隐私模式/配额满）已 try/catch，发提示让主持人导出 |
| `crypto.getRandomValues` | 抽奖种子 | 广泛支持（不需 secure context） | 退回 `Math.random` |
| `crypto.randomUUID` | 奖品图片 id | secure context + Safari 15.4+ | 退回 `getRandomValues` / 时间戳生成唯一 id |
| `crypto.subtle`（SHA-256） | 可验证公平的**加密承诺** | **secure context** | 降级为非加密 FNV-1a 哈希（仍是种子的确定性函数、承诺-验证逻辑成立，但密码学强度弱） |
| `IndexedDB` | 奖品图片本地存储 | 广泛支持（隐私模式可能受限） | 读取失败时降级为无图，不影响抽奖 |
| `BroadcastChannel` | **双屏遥控** | **Safari 15.4+**（Chrome 54+/Firefox 38+） | 双屏按钮置灰 + 点击提示；展示窗不挂双屏接线 |
| `Service Worker` | PWA 离线 | 广泛支持（Safari 11.1+） | 不缓存，需联网；不影响在线使用 |
| `clipboard.writeText` | 复制验证数据 | secure context | try/catch，失败提示手动复制 |
| Web Audio (`AudioContext`) | 抽奖音效 | 广泛支持（需用户手势） | try/catch 静默，无音效 |
| `backdrop-filter` | 面板/横幅毛玻璃 | Safari 需 `-webkit-` 前缀 | 已补前缀；再不支持只是无模糊，不影响功能 |

## 各功能的最低要求

| 功能 | 最低要求 |
| --- | --- |
| 核心抽奖 | 支持 CSS3D + ES2020 的浏览器（≈ 2020 年后主流浏览器） |
| 离线使用（PWA） | Service Worker（Safari 11.1+），需 HTTPS/localhost |
| 奖品图片 | IndexedDB（图片 id 已降级，任何环境可用） |
| 可验证公平（加密承诺） | secure context；否则降级为弱哈希 |
| 双屏遥控 | BroadcastChannel（Safari 15.4+ / 现代 Chrome、Firefox、Edge） |

## 能力检测与提示

启动时由 [`capability-check.ts`](../src/views/lottery/core/capability-check.ts) 检测 secure context、`BroadcastChannel`、`IndexedDB` 三项能力，把受限的功能列成清单。

若有受限项，[`LotteryCompatNotice`](../src/views/lottery/components/LotteryCompatNotice.tsx) 会弹一个**温和的提示卡片**，说明哪些功能在当前环境降级、核心抽奖不受影响，点「知道了」后记住、不再打扰。这个提示**不阻断**任何操作。

## 给部署/使用者的建议

- **优先用线上版本**或自己部署到 **HTTPS** 域名，能拿到全部功能（含加密公平承诺、剪贴板）。
- 内网使用时，用 `localhost` 或 HTTPS 访问，**不要直接双击 `file://` 打开**，否则加密承诺会降级、复制可能失效。
- 现场主力浏览器建议 **Chrome / Edge 最新版**；Safari 需 **15.4 及以上**才能用双屏。
- 双屏遥控需要把控制窗和展示窗放在**同一台电脑的同一浏览器**（靠 `BroadcastChannel` 同源通信），不能跨设备。
