import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import lotteryConfig from '../core/lottery-config'
import STATUS from '../core/lottery-status'
import { isRehearsal } from '../core/rehearsal'
import { attestationUnavailableReason, buildAttestation, commitKind, readPackageCommit } from '../core/attestation'
import type { Attestation } from '../core/attestation'
import { markAttestationShown } from '../core/attestation-reminder'
import LotteryAttestation, { FingerprintCheck } from './LotteryAttestation'
import { getLotteryVersion, useLotteryVersion } from '../core/lottery-store'
import { createVerificationPackage, downloadVerificationFile, ensureSeedCommit, verifyCurrent } from '../core/lottery-fairness'
import type { VerifyResult } from '../core/lottery-fairness'
import { verifyVerificationPackage } from '../core/fairness-package'
import { planProgressRestore, summarizeProgress } from '../core/progress-restore'
import type { RestoreSummary } from '../core/progress-restore'
import { appConfirm, toast } from './feedback'
import { useOnEscape } from './useOnEscape'
import './lottery-fairness.scss'

interface Props {
  onClose: () => void
  controlConnected?: boolean // 双屏控制窗已连接时不能恢复进度（决策 012 #2）
  onRestored?: () => void // 恢复写入成功后的动作，默认刷新页面
}

// 恢复前后两份进度的概况，写进确认框。
function describeSummary(summary: RestoreSummary): string {
  return `${summary.rounds} 轮、${summary.winners} 人中奖（${summary.entries} 条操作记录）`
}

// 恢复按钮不可用的原因；可用时返回 null。只在正式舞台、没有控制窗、空闲时可用。
// “空闲”与公证卡相同，按 idle 或 presenting：presenting 时本轮结果已经落盘、没有动画在跑，
// 恢复成功后页面会刷新，不会留下和存档对不上的演出状态。
function restoreUnavailableReason(rehearsal: boolean, controlConnected: boolean, phase: string): string | null {
  if (rehearsal) return '彩排不读写正式进度，请在正式舞台恢复'
  if (controlConnected) return '双屏控制中，请先退出双屏控制再恢复'
  if (phase !== 'idle' && phase !== 'presenting') return '抽奖进行中，结束后再恢复'
  return null
}

// 抽奖公平性面板：展示种子承诺/揭示，一键离线自验证
export default function LotteryFairness({ onClose, controlConnected = false, onRestored = () => window.location.reload() }: Props) {
  const version = useLotteryVersion()
  const phase = useSyncExternalStore(STATUS.subscribe, STATUS.getPhase)
  const [card, setCard] = useState<Attestation | null>(null)
  const [seedVisible, setSeedVisible] = useState(false)
  // 公证卡打开时 Escape 只关卡片，不连带关掉面板。
  useOnEscape(() => { if (card) setCard(null); else onClose() })
  // commit：导入文件里读出的指纹，只用于显示和核对。
  const [result, setResult] = useState<{ value: VerifyResult; version: number | null; source: string; commit?: string | null; importId?: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const restoreInput = useRef<HTMLInputElement>(null)
  const importCount = useRef(0)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false) // 和验证的 busy 分开，免得验证按钮显示“验证中…”
  // 确认框打开期间控制窗可能连上；确认后按最新值再查一次。
  const controlConnectedRef = useRef(controlConnected)
  useEffect(() => { controlConnectedRef.current = controlConnected }, [controlConnected])

  // 打开即锁定承诺哈希。承诺含随机盐，公布指纹不会泄露种子
  useEffect(() => {
    void ensureSeedCommit().catch(() => toast('种子承诺生成失败，请稍后重试'))
  }, [])

  // 双屏控制窗可以在面板打开时发起抽奖；离开空闲就收起公证卡，不在演出中盖住舞台。
  useEffect(() => STATUS.subscribe(() => { if (!STATUS.isWait()) setCard(null) }), [])

  const drawCount = lotteryConfig.drawLog.filter(e => e.type === 'draw').length
  // 测试里的 mock 没有 seedSalt，所以用 Boolean 兜住 undefined
  const salted = Boolean(lotteryConfig.seedSalt) && lotteryConfig.seedCommit.length === 64

  // “空闲”按 isWait()：idle 或 presenting，都没有动画在跑，等主持人操作。
  const idle = phase === 'idle' || phase === 'presenting'
  const cardUnavailable = attestationUnavailableReason(commitKind(lotteryConfig.seedCommit, lotteryConfig.seedSalt || ''))
    ?? (idle ? null : '抽奖进行中，结束后再打开公证卡')

  function openCard() {
    const next = buildAttestation({
      title: lotteryConfig.headerTitle,
      seedCommit: lotteryConfig.seedCommit,
      seedSalt: lotteryConfig.seedSalt || '',
      rosterCount: lotteryConfig.cardList.length,
      prizes: lotteryConfig.prizeList,
      drawLog: lotteryConfig.drawLog,
      rehearsal: isRehearsal(),
      now: new Date(),
    })
    if (!next) return
    markAttestationShown()
    setCard(next)
  }

  async function handleVerify() {
    setBusy(true)
    try {
      await ensureSeedCommit()
      const verifiedVersion = getLotteryVersion()
      setResult({ value: await verifyCurrent(), version: verifiedVersion, source: '当前场次' })
    } catch {
      toast('验证失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    try {
      await ensureSeedCommit()
      await navigator.clipboard.writeText(JSON.stringify(createVerificationPackage(), null, 2))
      toast('验证数据已复制到剪贴板')
    } catch {
      toast('复制失败，请下载验证文件')
    }
  }

  async function handleDownload() {
    try {
      await downloadVerificationFile()
    } catch {
      toast('验证文件生成失败，请稍后重试')
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const value = await verifyVerificationPackage(parsed)
      setResult({ value, version: null, source: '导入文件', commit: readPackageCommit(parsed), importId: ++importCount.current })
    } catch {
      setResult({ value: { ok: false, checkedDraws: 0, failedAt: null, reason: '文件不是有效的 JSON 验证数据' }, version: null, source: '导入文件' })
    } finally {
      setBusy(false)
    }
  }

  const restoreUnavailable = restoreUnavailableReason(isRehearsal(), controlConnected, phase)

  async function handleRestore(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setRestoreError(null)
    setRestoring(true)
    try {
      let parsed: unknown
      try {
        parsed = JSON.parse(await file.text())
      } catch {
        setRestoreError('没有恢复：文件不是有效的 JSON')
        return
      }
      // 先复算整份文件、再和当前名单与奖项逐项比对，全部通过才弹确认框。
      const plan = await planProgressRestore(parsed, lotteryConfig)
      if (!plan.ok) {
        setRestoreError(`没有恢复：${plan.reason}`)
        return
      }
      const current = summarizeProgress({ drawLog: lotteryConfig.drawLog, cardListWinAll: lotteryConfig.cardListWinAll.map(card => card.id) })
      const replacing = lotteryConfig.drawLog.length > 0
      const lost = current.rounds - plan.summary.rounds
      const warning = replacing
        ? `当前场次已有 ${describeSummary(current)}，恢复后会被替换。旧进度会留底，可在配置面板“导出未恢复的旧进度”找回。`
          + (lost > 0 ? `\n备份比当前场次少 ${lost} 轮，这 ${lost} 轮的结果会丢失。` : '')
        : undefined
      const confirmed = await appConfirm(
        `从验证文件恢复「${lotteryConfig.headerTitle}」的抽奖进度\n`
          + `备份：${describeSummary(plan.summary)}\n`
          + `当前：${describeSummary(current)}\n`
          + '验证文件不含活动标题，请确认上面的标题就是这场活动。恢复后页面会刷新。',
        { confirmText: replacing ? '替换当前进度并刷新' : '恢复并刷新', warning },
      )
      if (!confirmed) return
      const blocked = restoreUnavailableReason(isRehearsal(), controlConnectedRef.current, STATUS.getPhase())
      if (blocked) {
        setRestoreError(`没有恢复：${blocked}`)
        return
      }
      const written = lotteryConfig.replaceProgress(plan.saved)
      if (!written.ok) {
        setRestoreError(`没有恢复：${written.reason}`)
        toast(`⚠ 恢复失败：${written.reason}`, 8000)
        return
      }
      toast('进度已恢复，正在刷新页面')
      onRestored()
    } catch {
      setRestoreError('没有恢复：读取文件失败，请重试')
    } finally {
      setRestoring(false)
    }
  }

  const visibleResult = result?.version === null || result?.version === version ? result : null

  return (
    <div className="lottery-fairness">
      <button type="button" className="close-btn" aria-label="关闭" onClick={onClose}>✖</button>
      <h2 className="panel-title">🛡 抽奖公平性</h2>

      <p className="fairness-intro">
        本程序使用<strong>种子化随机</strong>，可以用完整验证文件复算每轮抽奖、作废和撤销。
        验证通过表示文件内部的承诺、规则与结果一致；{salted ? '指纹已绑定本场名单顺序和奖项规则，请核对开抽前公布的指纹。' : '请另行核对开抽前公布的指纹与名单。'}
        本地验证无法证明公布时间，也无法阻止整份数据被替换。
      </p>

      <section className="fairness-field">
        <h3>种子承诺指纹（开抽前公布）</h3>
        <code className="mono">{lotteryConfig.seedCommit || '生成中…'}</code>
        <p className="hint">{lotteryConfig.seedCommit.length === 8 ? 'FNV-1a（兼容模式，非加密校验）' : salted ? 'SHA-256（含随机盐，绑定名单顺序与奖项规则）' : 'SHA-256'}。请在开抽前记录并公布此值，验证时与原记录核对。</p>
        <div className="attestation-entry">
          <button type="button" className="attestation-btn" disabled={cardUnavailable !== null} onClick={openCard}>公证卡</button>
          <span className="hint">{cardUnavailable ?? '全屏展示分组指纹和短码，可投屏、打印、导出 PNG'}</span>
        </div>
      </section>

      <section className="fairness-field seed-field">
        <h3>当前种子</h3>
        {/* 默认隐藏：面板常被投屏，种子一旦出现在屏幕或照片里，后续结果就能被算出来。 */}
        <div className="seed-reveal">
          <code className={'mono ' + (seedVisible ? 'seed-value' : 'seed-hidden')}>{seedVisible ? lotteryConfig.seed : '已隐藏'}</code>
          <button type="button" className="seed-toggle" onClick={() => setSeedVisible(visible => !visible)}>{seedVisible ? '隐藏种子' : '显示种子'}</button>
        </div>
        <p className="fairness-warning" role="note">
          ⚠ 种子公开后，本场后续每一轮结果都可以被算出来。活动进行中不要投屏、拍照或分享种子和验证文件。
          {seedVisible && <strong> 种子正在显示，请确认屏幕没有投出去。</strong>}
        </p>
        <p className="hint">已记录 {drawCount} 轮抽奖。验证文件包含有序名单、奖项规则、所有操作和最终结果，可在另一设备导入验证。</p>
      </section>

      <section className="fairness-actions" style={{ flexWrap: 'wrap' }}>
        <button className="primary" disabled={busy} onClick={handleVerify}>{busy ? '验证中…' : '立即自验证'}</button>
        <button onClick={handleCopy}>复制验证数据</button>
        <button onClick={handleDownload}>下载验证文件</button>
        <button disabled={busy} onClick={() => fileInput.current?.click()}>验证文件</button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={handleImport} />
        <span className="export-hint">验证数据含种子，活动结束后再分享</span>
      </section>

      <section className="restore-entry">
        <button type="button" className="restore-btn" disabled={busy || restoring || restoreUnavailable !== null} onClick={() => restoreInput.current?.click()}>从验证文件恢复进度</button>
        <input ref={restoreInput} className="restore-input" type="file" accept=".json,application/json" hidden onChange={handleRestore} />
        <span className="hint">{restoreUnavailable ?? '换机或浏览器数据丢失时使用：先导入这场活动的配置，再选择之前下载的验证文件'}</span>
      </section>
      {restoreError && <div className="restore-result fail" role="alert">{restoreError}</div>}

      {visibleResult && (
        <div className={'verify-result ' + (visibleResult.value.ok ? 'ok' : 'fail')} role="status">
          {visibleResult.value.ok
            ? `✓ ${visibleResult.source}验证通过：承诺一致，已复算 ${visibleResult.value.checkedDraws} 轮及全部操作，最终结果一致`
            : `✗ ${visibleResult.source}验证未通过：${visibleResult.value.failedAt === null ? '' : `第 ${visibleResult.value.failedAt + 1} 条记录：`}${visibleResult.value.reason}`}
        </div>
      )}
      {/* 每次导入换一个 key：重新导入时清空上一次的核对输入 */}
      {visibleResult?.commit && <FingerprintCheck key={visibleResult.importId} commit={visibleResult.commit} />}

      {card && <LotteryAttestation card={card} onClose={() => setCard(null)} />}
    </div>
  )
}
