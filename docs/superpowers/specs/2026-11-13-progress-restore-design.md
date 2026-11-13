# 进度备份与换机恢复 设计文档

日期：2026-11-13

本文只做设计，不改生产代码。结论经过一次性原型验证（原型已删除，结果见“原型结论”）。

## 目标

1. 投影电脑死机、浏览器数据被清、需要换一台机器时，主持人能用一个文件把抽奖进度接回去，继续抽，最后导出的验证文件仍然通过。
2. 恢复前必须证明备份文件没有被改过，并且和当前名单、奖项规则一致；对不上就拒绝，不做任何“尽量恢复”。
3. 恢复遵守多窗口版本规则（计划 003 的 `revision`），不能在别的窗口还开着时悄悄覆盖它的进度。
4. 不改验证文件格式，不改随机算法，不改 `phase` 状态机。

## 非目标

- 不做自动云同步，不做定时自动下载。
- 不恢复配置本身（标题、头像、奖品图、揭晓节奏）。配置继续用现有的配置 JSON 导入导出。
- 不支持彩排（`?mode=rehearsal`）恢复，彩排不读写正式进度。
- 不把被拒绝的旧进度（计划 007 的备份）自动转成可恢复的备份，见第 5 问。

## 现状

执行基线 `c3f9290`（计划 001–008、010、013、015 已合并；013 只合入了设计文档，代码没有改）。计划写作时的基线是 `a9634fb`，这几个文件之后有改动（`git diff --stat a9634fb..HEAD`：`lottery-config.ts` +112、`fairness-package.ts` +26、`lottery-fairness.ts` +22、`config-restore.ts` +2）。下表以现在的代码为准，和计划里的字段表比，新增了 `revision`、`seedSalt`，并且验证文件升到了 version 2。

### 字段对照表

存档由 `src/views/lottery/core/lottery-config.ts` 的 `setLocalStorage()`（146–184 行，对象在 154–174 行）写入，`getLocalStorage()`（197–254 行）读回；验证文件由 `src/views/lottery/core/lottery-fairness.ts` 的 `createVerificationPackage()`（66–92 行）生成。

| 存档字段 | 写入位置 | 读回位置 | 验证文件里有没有 | 重建方法 |
|---|---|---|---|---|
| `version`（固定 2） | `lottery-config.ts:155` | `config-restore.ts:43`（接受缺省或 2） | 不需要 | 写 2 |
| `revision` | `lottery-config.ts:149、156` | `lottery-config.ts:99-109`（`readStoredRevision`，缺省按 0） | 不需要 | 不重建，由 `setLocalStorage()` 取 `knownRevision + 1` |
| `hash` | `lottery-config.ts:157`（来自 71 行 `configHash`） | `lottery-config.ts:215` 比较 | 没有，验证文件不含标题 | 用当前配置算，见下方“hash 的来源” |
| `currentPrize` | `lottery-config.ts:158` | `lottery-config.ts:228` | 没有 | 写 `null`（新场次初始值就是 `null`，124 行） |
| `prizeList[].id / countRemain / round / cardListWin` | `lottery-config.ts:160-165` | `lottery-config.ts:231-240`（`countRemain` 读回时按 `count - cardListWin.length` 重算） | `finalState.prizes[]` 的 `id`、`countRemain`、`round`、`winnerIds`（`lottery-fairness.ts:87-89`） | 直接映射 |
| `cardListWinAll` | `lottery-config.ts:166` | `lottery-config.ts:242` | 没有现成字段 | 重放 `drawLog`（见下） |
| `cardListRemainAll` | `lottery-config.ts:167` | `lottery-config.ts:243` | 没有 | 当前名单顺序过滤掉中奖和排除（与 `lottery-algorithm.ts:7-13` 的 `recomputeRemain` 同规则） |
| `cardListExcluded` | `lottery-config.ts:168` | `lottery-config.ts:244` | `finalState.excludedIds`（`lottery-fairness.ts:86`） | 直接映射 |
| `seed` | `lottery-config.ts:169` | `lottery-config.ts:246-247` | `seed`（73 行） | 直接映射 |
| `rngState` | `lottery-config.ts:170` | `lottery-config.ts:248` | `finalState.rngState`（85 行） | 直接映射 |
| `seedCommit` | `lottery-config.ts:171` | `lottery-config.ts:249` | `seedCommit`（75 行） | 直接映射 |
| `seedSalt` | `lottery-config.ts:172` | `lottery-config.ts:251`（缺省且已有承诺时按空串，没有承诺时用新盐） | 仅 version 2 有（74 行）；version 1 没有 | version 2 直接映射；version 1 不写这个键（旧存档本来就没有） |
| `drawLog` | `lottery-config.ts:173` | `lottery-config.ts:252` | `drawLog`（78-83 行，复制自存档） | 直接映射 |

两个需要说明的点：

- **`cardListWinAll` 的顺序**：它是跨奖项的“中奖先后顺序”（`lottery-algorithm.ts:38` 追加，作废和撤销时过滤）。验证文件里只有每个奖项各自的 `winnerIds`，合并后会丢掉跨奖项的先后。重建时重放 `drawLog`（`draw` 追加、`void` 删除一人、`undo` 删除最近一轮）可以还原出和原存档完全一致的顺序，原型已验证。
- **hash 的来源**：验证文件没有标题，所以存档里的 `hash` 只能用当前配置算（`config-apply.ts:92-94` 的 `activeConfigHash()` 就是这样算当前配置指纹的）。这意味着“标题是否一致”无法由验证文件校验，见待决问题 1。

### 验证文件和校验器

- `src/views/lottery/core/fairness-package.ts:73-88`（`validPackage`）校验结构；`104-186` 行的 `verifyVerificationPackage` 重新计算承诺、重放整份流水和最终状态，不读取当前场次，可以在任何环境独立运行。version 2 的承诺（`31-36` 行 `commitmentContext`）绑定了名单顺序和奖项规则（`id`、`name`、`count`、`everyTimeGet`），所以名单顺序或奖项规则被改，承诺校验先失败。
- 非安全上下文没有 `crypto.subtle`，sha256 类承诺（version 1 的 `sha256`、version 2）校验会返回“此环境无法验证 SHA-256 承诺”（`fairness-package.ts:114`）；只有旧的 `fnv1a32` 承诺可以在非安全上下文验证。
- `src/views/lottery/core/config-restore.ts:38-92` 的 `isSavedRestorable` 校验存档结构和所有 ID 引用，启动恢复和（本设计的）手动恢复可以共用。

### 现有入口和相关规则

- `src/views/lottery/components/LotteryFairness.tsx:71-79、114-115` 已经有“验证文件”导入按钮，导入后调用 `verifyVerificationPackage` 展示结果，不改变场次。
- 计划 003：`setLocalStorage()` 先 `checkProgressStale()`，别的窗口写过更新版本时**静默不写**（148 行）；写入抛错只发 `storage-error` 事件，不抛异常（177-183 行）。这两点对恢复都是陷阱，见第 4 问。
- 计划 007：`keepRejectedProgress`（`lottery-config.ts:87-94`）把无法恢复的旧进度原文连同原因写进 `___lottery_rejected___`，只保留最近一份；`reason` 目前只有 `invalid-json`、`config-mismatch`、`invalid-progress`。`LotteryConfigPanel.tsx:364` 提供“导出未恢复的旧进度”。
- 计划 013（参与者身份）设计已合并，代码未实现，与恢复的交互见“与计划 013 的关系”。

## 原型结论

原型文件 `src/views/lottery/core/progress-restore.spike.test.ts` 已运行，6 个用例全部通过（`pnpm exec vitest run src/views/lottery/core/progress-restore.spike.test.ts`），随后删除，没有提交。

场次：8 人名单，两个奖项（一等奖 3 个每轮 1 人，二等奖 2 个每轮 2 人），用真实模块抽取：一等奖两轮、作废一人并设为“不再参与”、撤销最近一轮、二等奖一轮、一等奖再一轮；`ensureSeedCommit` 后导出 version 2 验证文件。

- **可行**：只用“验证文件 + 当前配置”重建出的存档对象通过 `isSavedRestorable`，并且和原存档**逐字段完全相等**（`toEqual`，仅除去 `revision` 和 `currentPrize`）。其中包含一次作废（`cardListExcluded` 非空）和一次撤销（流水里有 `undone: true` 的轮次）。没有触发 STOP 条件。
- **换机后继续抽**：清空 localStorage、只保留同一份配置，写入重建的存档后重新加载模块：`cardListWinAll`、`rngState`、`drawLog` 和原场次一致，没有触发“旧进度被拒绝”，`createVerificationPackage()` 的输出与恢复前的验证文件 `toEqual`，`verifyCurrent()` 通过；再抽一轮后 `verifyCurrent()` 仍通过。
- **两种写入方式都可行**：方案 A（在内存里应用存档，再调用 `setLocalStorage()`）写出的内容与原存档一致，`revision` 从 1 起；方案 B（直接写原文，`revision` 取存储版本加 1，然后重载页面）也可行。方案 A 的原型是手工把字段赋给 `lotteryConfig`，说明正式实现需要把 `getLocalStorage()` 里“把存档应用到内存”的那段抽成独立函数。
- **多窗口陷阱已复现**：别的窗口把存储里的 `revision` 改成 99 后，本窗口调用 `setLocalStorage()` 存储内容不变，`isProgressStale()` 变为 `true`。恢复流程必须检查这个结果，不能假设写入成功。
- **拒绝路径**：改了 `finalState` 的文件被 `verifyVerificationPackage` 拒绝；两个名单项互换的文件被拒绝（v2 承诺绑定名单顺序）；文件自洽但当前名单比文件多一人时，名单比较失败（`roster-mismatch`）。
- **version 1（无盐）文件也能重建**：重建结果不带 `seedSalt` 键，同样通过 `isSavedRestorable`。这一条用的是手工把 version 2 文件改写成 version 1 的包（重算无盐 sha256 承诺），不是真实旧文件，只能说明“字段缺省路径”可行。

原型里重建函数的主体（正式实现可以直接参考，函数名不是最终命名）：

```ts
const v = await verifyVerificationPackage(pkg)           // 先复算，失败就拒绝
if (!v.ok) throw new Error('verify: ' + v.reason)
// 名单（id、name、顺序）和奖项（id、name、count、everyTimeGet、顺序）必须与当前配置逐项相等
// 重放流水得到跨奖项中奖顺序
let winAll: string[] = []; const lastDraw: string[][] = []
for (const e of pkg.drawLog) {
  if (e.type === 'draw') { winAll = [...winAll, ...e.winnerIds]; lastDraw.push(e.winnerIds) }
  else if (e.type === 'void') winAll = winAll.filter(id => id !== e.winnerIds[0])
  else { const d = lastDraw.pop()!; winAll = winAll.filter(id => !d.includes(id)) }
}
// 剩余池：当前名单顺序过滤掉 winAll 和 finalState.excludedIds
```

**原型没有证明的事**（需要正式实现时验证）：真实浏览器里的“重载页面”、双屏显示窗口在恢复后的重连、`storage` 事件让其他窗口进入过期状态（单测里只测了 `isProgressStale()` 的比较逻辑）、非安全上下文下的拒绝提示。

## 设计

### 1. 备份文件形式

**推荐：B。继续用两个文件。** 进度备份就是现有的验证文件；配置沿用现有的配置 JSON。恢复时只让主持人选一个验证文件，配置必须先和它一致（不一致就拒绝并告诉他先导入哪份配置）。

理由：
- 验证文件已经包含恢复所需的全部进度字段（上面的对照表只缺 `currentPrize` 和 `hash`，都能确定性地补出来），原型证明它够用，**不需要改验证文件格式**（AGENTS.md 要求改格式前先确认旧文件仍能验证）。
- 配置导入、图片存 IndexedDB 的流程已经成熟。一个“活动备份”文件要打包图片（`inlineConfigImages` 会把图片内联成 data URL），文件可能很大，还多了一套要长期兼容的格式。
- 备份文件的“验证”和“恢复”共用同一个文件，导出入口已经存在（`LotteryFairness.tsx` 的导出按钮），主持人不需要学新东西。

放弃的方案：
- **A. 新的“活动备份”文件，里面放配置（含图片）和验证文件**：好处是一个文件搞定、可以顺带校验标题；坏处是新增一个长期格式、图片让文件变大、配置和进度的版本要各自演进，而且标题校验可以用待决问题 1 的小改动解决，不值得为它另起格式。

已知代价：换机时要带两个文件（配置 JSON 和验证文件），漏带配置就恢复不了。README 的现场准备要写明“每个奖项结束后导出验证文件，并保留配置 JSON”（实现提交里补）。

### 2. 恢复前的校验

**推荐：按顺序做 6 项检查，任何一项不过就停，不写任何东西。** 提示语写成主持人能直接照着做的话。

| 顺序 | 检查 | 失败提示（给主持人看的原意） |
|---|---|---|
| 1 | 阶段必须是 `idle`；非彩排；本窗口没有过期（`isProgressStale()` 为假） | “现在不能恢复：请等待当前这一轮结束 / 请回到正式舞台 / 其他窗口已更新进度，请关闭其他窗口后刷新页面再试” |
| 2 | 文件是合法 JSON | “文件不是有效的 JSON” |
| 3 | `verifyVerificationPackage(pkg).ok`，不通过就把它自己的 `reason` 原样显示 | 沿用校验器的原因，如“种子与已公布的承诺不一致”“此环境无法验证 SHA-256 承诺，请在 HTTPS 或 localhost 打开” |
| 4 | 名单：`roster` 的 `id`、`name` 与当前 `cardList` 逐项相等（顺序也要相等） | “备份里的名单和当前名单不一致（第 N 位：备份是 X，当前是 Y / 人数不同）。请先导入备份对应的配置” |
| 5 | 奖项：`prizes` 的 `id`、`name`、`count`、`everyTimeGet` 与当前 `prizeList` 逐项相等 | “备份里的奖项规则和当前不一致（哪一项）。请先导入备份对应的配置” |
| 6 | 重建存档并过 `isSavedRestorable(saved, cardList, prizeList)` | “备份无法转成进度：<原因>”（理论上过了 3–5 项不会失败，作为最后一道保险） |

要点：
- 第 3 项**不能跳过**，即使在非安全上下文也不能降级为“只看结构”。无法验证就拒绝，并提示换到 HTTPS 或 localhost 打开（只有 `fnv1a32` 的老文件可以在非安全上下文通过）。
- 第 4、5 项在 version 2 文件上其实被承诺校验覆盖了一半（文件自己的名单被改会让第 3 项失败），但它们回答的是另一个问题：“文件自洽，但和现在这份配置是不是同一场”。两者都要做。
- 标题无法校验，见待决问题 1。

放弃的方案：
- **名单或奖项不一致时自动改配置再恢复**：会同时改动配置、清空或覆盖进度，一次操作两件高风险的事，出错时无法判断是哪一步错了。
- **只比较承诺或指纹，不逐项比较**：指纹只含名字，不含 ID 和顺序以外的信息，而且报错时无法告诉主持人到底哪里不同。

### 3. 入口和时机

**推荐：入口放在公平性面板（`LotteryFairness.tsx`），紧挨现有的“验证文件”按钮，新增“从验证文件恢复进度”。** 只在正式舞台、`phase === 'idle'` 时可点。

- 选择文件后先复用现有的验证展示（同一个 `verifyVerificationPackage`），通过后再弹确认框，确认框显示：备份文件里的轮数、已中奖人数；当前场次的轮数、已中奖人数。
- **当前没有任何抽奖记录（`drawLog` 为空）**：确认框是普通确认（“用备份恢复 N 轮、M 人中奖的进度？页面会刷新”）。
- **当前已有抽奖记录**：允许覆盖，但确认框用红字写明“当前场次已有 K 轮结果，恢复后会被替换”；如果备份的轮数比当前少，加一句“备份比当前场次少 J 轮，这 J 轮的结果会丢失”。按钮文字为“替换当前进度并刷新”，不是普通的“确定”。
- 覆盖时旧进度先留底（见第 5 问）。

理由：公平性面板本来就是“导入验证文件”的地方，用户心智一致；配置面板的“保存并应用”会清进度，恢复放在那里容易和“改配置”混淆。

放弃的方案：
- **放在配置面板**：该面板的动作都以“保存配置”为中心，且保存时可能清进度；恢复要求配置先已经保存好，放在同一个面板里容易让人以为可以一次完成。
- **只允许在没有任何抽奖记录时恢复**：最常见的故障（死机、清数据）之后存储是空的，所以这能满足大多数情况；但“localStorage 配额写入失败，存档停在较早的轮次”“多次重启出现过半个场次”的情况会把主持人锁死在较旧的进度上而无法用更新的备份，所以保留覆盖，用二次确认和留底控制风险。
- **允许在 `idle` 以外的阶段恢复**：抽奖演出中内存里有锁定的结果和动画状态（AGENTS.md：停止时先锁定阶段、抽取并保存结果再演出），此时改状态会让演出和存档对不上。

### 4. 写入规则

**推荐：方案 A。** 把 `getLocalStorage()` 里“把存档应用到内存”的那一段（`lottery-config.ts:224-253`）抽成一个独立函数，启动恢复和手动恢复共用；手动恢复调用它之后走 `setLocalStorage()` 落盘，然后核对写入结果，再刷新页面。

流程：
1. 检查 `isProgressStale()`，过期则拒绝（第 2 问第 1 项已查，写入前再查一次）。
2. 应用存档到内存（共用函数）。
3. 调用 `setLocalStorage()`。它在“别的窗口抢先写入”时静默不写，在“配额不足”时只发 `storage-error` 事件，所以**调用后必须读回存储，确认 `revision` 已经是新值且内容就是重建的内容**，否则提示失败并且**不刷新页面**（刷新会让旧进度重新生效，主持人以为恢复成功）。
4. 读回成功后 `location.reload()`。其他窗口通过 `storage` 事件自动进入过期状态（计划 003）。

理由：
- 启动恢复和手动恢复走同一段应用代码，两条路径不会各自漂移（字段表有十几行，维护两份很容易漏）。
- `setLocalStorage()` 自带 `revision` 递增、过期检查和写入失败处理，恢复不重新实现这些规则，也不会在“写入格式”上出现第三份拷贝（写入、启动读取之外）。
- 原型的方案 A 用例证明了写出的内容与原存档一致。

放弃的方案：
- **方案 B：直接 `localStorage.setItem` 写原文，`revision` 取存储版本加 1，然后刷新**：原型证明可行，也不需要改 `lottery-config.ts`。但它绕过了 `setLocalStorage()` 的过期检查和失败处理，需要自己复制一遍存档字段和版本规则，计划 012 的维护说明明确要求恢复写入走 `setLocalStorage()`，所以放弃。
- **刷新页面后再写**：刷新后内存回到旧进度，且要靠 sessionStorage 之类传递备份内容，多一个中间状态。

### 5. 与计划 007（被拒绝的旧进度备份）的关系

**推荐：两件事分开。**

1. **被拒绝的旧进度不作为恢复来源。** 它是原样的存档 JSON，只含 ID 和流水，不含名单和奖项规则的快照，也没有 `finalState`，所以无法交给 `verifyVerificationPackage` 做独立复算；“配置变了”导致的拒绝（`config-mismatch`）里，名单本身就已经不同，更无从比对。没有验证就不应该写成正式进度。它继续用现有的“导出未恢复的旧进度”交给技术人员排查。
2. **恢复覆盖已有进度时，把被替换的旧进度留底到 `___lottery_rejected___`。** 做法是让 `keepRejectedProgress` 的 `reason` 增加 `replaced-by-restore`，恢复流程在“应用存档”之前调用它。这样主持人点错确认后，还能通过“导出未恢复的旧进度”找回。注意：只保留最近一份，连续恢复两次后第一份旧进度会被覆盖；备份写入失败（配额）时不阻止恢复，但确认框要提示“旧进度无法留底”（见待决问题 3）。

放弃的方案：**把被拒绝的备份也当作恢复来源**：没有名单快照就无法验证；若放宽到“只检查 `isSavedRestorable`”，等于接受未经复算的进度，一份被改过的存档会被当成正式结果。

### 6. 定时备份提醒

**推荐：只在“某个奖项抽完”时提醒一次，不做定时提醒。** 某个奖项的 `countRemain` 降到 0 且回到 `idle` 后，弹一个不遮挡舞台的提示：“<奖项> 已抽完，建议导出验证文件备份”，带一个“导出”按钮。主持人可以忽略，不强制。

- 同一个奖项只提醒一次（作废后又补抽、再抽完不重复提醒，除非主持人手动导出过之后再有新的结果，细节留给实现）。
- 提示文案要写明：**备份文件包含种子，活动结束前请自己保管，不要公开**（现有面板文案已经说明“种子公开后，后续结果可预测”，见 `LotteryFairness.tsx:107`）。

理由：奖项抽完是自然的存盘点，次数少（通常 3–6 次）、不打扰；每轮提醒会在现场反复打断；以奖项为单位也方便主持人对应“丢了哪个奖项的结果”。

放弃的方案：
- **每轮或定时（比如每 10 分钟）提醒**：现场舞台上反复弹窗打断流程，而且定时器和演出动画无关，提醒容易落在揭晓动画上。
- **自动下载备份文件**：浏览器可能拦截连续下载，下载目录里堆满文件，且主持人没有同意；AGENTS.md 要求“不能静默丢结果”，但自动写文件超出了这个范围。

### 与计划 013（参与者身份）的关系

013 设计里有三处会影响恢复，实现时必须处理（013 代码未合入，以下是对它设计文档的解读，没有实测）：

1. **验证文件名单条目会多一个可选的 `employeeId`，`commitmentContext` 也会把它放进承诺。** 第 2 问第 4 项的名单比较要同时比较 `employeeId`（缺省视为空）。否则出现“两个同名者的工号互换”时：文件自己的承诺仍然成立（它用的是文件里自己的名单），名字和 ID 也相同，名单比较会通过，恢复后“张伟”这个结果就指向了另一个人。
2. **配置指纹含工号。** 恢复写入的 `hash` 用当前配置算，所以天然带上当前工号。如果当前配置的工号与备份不同，第 4 项会拒绝，主持人需要先导入对应的配置。
3. **卡片 ID 仍由名字生成**，不变，所以按 ID 重建存档的逻辑不受影响。

如果恢复比 013 先落地，013 的实现提交要在“验证文件导入恢复”的测试里加一条“工号互换必须被拒绝”；如果 013 先落地，恢复的名单比较从一开始就带上 `employeeId`。

## 风险

| 风险 | 后果 | 控制方式 |
|---|---|---|
| **恢复出错误结果**：文件被改过 | 抽奖结果被伪造成正式进度 | 第 2 问第 3 项复算整份流水、承诺和最终状态；非安全上下文无法复算时拒绝而不是降级 |
| **文件与当前配置不是同一场**（名单顺序、奖项规则、工号不同） | 进度的 ID 指向别的人 | 第 2 问第 4、5 项逐项比较，不一致就拒绝；不自动改配置 |
| **标题不同**：验证文件不含标题 | 恢复后活动标题与备份时不同，但进度本身正确 | 提示里显示当前标题让主持人确认；是否把标题放进验证文件见待决问题 1 |
| **覆盖已有进度**：点错或备份更旧 | 已有结果丢失 | 红字确认框写明轮数差；旧进度留底到 `___lottery_rejected___`（只保留最近一份）；按钮文字写“替换当前进度并刷新” |
| **用更旧的备份恢复后重新抽**：此时随机状态回到备份时刻 | 此后抽出的名单取决于备份时刻的状态和主持人的操作；若操作顺序与丢失前相同，推断结果也相同（由 rng 的确定性推出，原型没测） | 确认框提示备份轮数；不禁止，因为不能让主持人在“旧备份”和“无法恢复”之间只有后者 |
| **多窗口冲突**：别的窗口还开着 | `setLocalStorage()` 静默不写，主持人以为恢复成功 | 写入前检查过期；写入后读回核对，不一致就报错且不刷新（原型已复现静默不写） |
| **写入失败**：配额不足 | 刷新后旧进度重新生效，被误认为恢复成功 | 读回核对，失败不刷新，提示导出验证文件或清理存储 |
| **旧版本文件**：version 1（无盐）、`fnv1a32` 承诺 | 部分环境无法复算 | 校验器已兼容 version 1；`fnv1a32` 可在非安全上下文通过；`sha256` 类文件在非安全上下文被拒绝并提示换环境 |
| **备份文件泄露种子** | 持有文件的人可以预测此后的结果 | 导出和提醒文案写明活动结束前自己保管；与现有验证文件导出提示一致 |
| **双屏**：显示窗口在恢复后的状态 | 显示屏可能仍显示旧数据 | 恢复后刷新控制窗口；显示窗口重连是否自动同步，原型没测，列入手工彩排项 |

## 正式实现的拆分建议

每个提交都带自己的测试；改动 UI、选择器或流程的提交在 push 前跑 `pnpm e2e`。

1. `refactor: 把存档应用到内存的逻辑从 getLocalStorage 中抽出`
   `lottery-config.ts` 抽出 `applySavedProgress`，`getLocalStorage` 调用它，行为不变。测试：现有 `lottery-config.test.ts` 全部通过，不新增行为。验证：`pnpm exec vitest run src/views/lottery/core/lottery-config.test.ts`，再 `pnpm type-check`。
2. `feat: 从验证文件和当前配置重建进度存档（纯函数）`
   新增 `progress-restore.ts`，导出 `planProgressRestore(pkg, cardList, prizeList, hash)`，返回成功（存档对象）或带原因的失败。测试：把本文原型的 6 个用例搬进去，再加“工号互换必须拒绝”（013 先落地时）、各类不一致的提示文本、`fnv1a32` 文件。验证：`pnpm exec vitest run src/views/lottery/core/progress-restore.test.ts`。
3. `feat: 恢复进度的写入流程（过期检查、读回核对、旧进度留底）`
   新增 `restoreProgress()`：阶段和过期检查、应用、`setLocalStorage()`、读回核对、`replaced-by-restore` 留底，不含刷新（由调用方刷新）。测试：写入成功；别的窗口先写（拒绝）；`setItem` 抛配额错误（报错、不改内存以外的东西）；覆盖时旧进度留在 `___lottery_rejected___`。验证：单测加 `pnpm type-check`。
4. `feat: 公平性面板增加从验证文件恢复进度`
   `LotteryFairness.tsx` 的按钮、确认框、提示语、彩排和非 `idle` 时禁用。测试：组件测试覆盖各提示和确认框内容（参考 `LotteryFairness.test.tsx`）。验证：单测，`pnpm lint`。
5. `test: 换新浏览器上下文恢复后继续抽奖，验证仍通过`
   Playwright：在一个上下文里抽几轮并导出验证文件，在新的独立上下文里导入同一份配置和验证文件、恢复，继续抽一轮，导出的验证文件通过（参考 `e2e/fairness.spec.ts` 新建独立上下文的写法）。另测“别的窗口还开着”时的拒绝。验证：`pnpm e2e e2e/progress-restore.spec.ts`，提交前跑完整 `pnpm e2e`。
6. `feat: 奖项抽完后提示导出验证文件`
   `Lottery.tsx` 监听奖项抽完。测试：单测（抽完一个奖项触发一次，重复不触发）加 e2e 一次手动查看。验证：单测加 `pnpm e2e`。
7. `docs: 现场准备增加备份与恢复说明`
   README 现场准备、`docs/compatibility.md`（非安全上下文下恢复被拒绝）。验证：人工核对。

## 留给维护者决定的问题

1. **标题要不要进验证文件？** 现在验证文件不含标题，恢复时无法判断标题是否和备份时一致，`hash` 只能用当前标题算。如果要校验，需要给验证文件加可选的 `headerTitle`（可选字段加入不会让旧校验器失败，但会让导出文件和承诺上下文是否变化需要另行评估）。推荐先不加，只在确认框里显示当前标题。
2. **恢复入口是否允许在双屏控制窗口连接时使用？** 本设计默认只在主舞台、`idle` 时可用；双屏下的显示窗口恢复后如何重连，需要手工彩排确认。
3. **旧进度留底失败（配额）时是否阻止恢复？** 本设计只提示、不阻止；如果维护者认为“留不下旧进度就不该覆盖”，可以改成阻止并建议先导出当前验证文件。
4. **备份比当前场次更旧时，是否要求更强的确认（比如输入“替换”二字）？** 本设计用红字加专用按钮文案，没有加输入确认。
5. **是否需要“从被拒绝的旧进度恢复”给技术人员用？** 本设计不支持（无法验证）。如果现场确实遇到过，可以单独设计一个“用旧进度的流水重建验证文件，再走本流程”的工具，这需要先确认流水里的 `winnerNames` 和 `poolIds` 是否足够重建名单快照（本设计没有验证）。
6. **“奖项抽完提醒”要不要可以关闭？** 本设计每个奖项提醒一次、可以忽略；如果主持人认为多余，可以加一个本场次内“不再提醒”。
7. **备份文件是否需要对外分享的版本？** 恢复用的验证文件包含种子，活动中公开会让后续结果可预测；公开复核用的验证文件应当在活动结束后再给。是否要在导出时区分“恢复用”和“公开用”，属于改验证文件格式，本设计没有做（公开版如何不暴露种子也需要另行设计）。
