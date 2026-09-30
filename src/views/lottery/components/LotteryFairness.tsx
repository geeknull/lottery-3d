import { useEffect, useRef, useState } from 'react'
import lotteryConfig from '../core/lottery-config'
import { getLotteryVersion, useLotteryVersion } from '../core/lottery-store'
import { createVerificationPackage, ensureSeedCommit, verifyCurrent } from '../core/lottery-fairness'
import type { VerifyResult } from '../core/lottery-fairness'
import { verifyVerificationPackage } from '../core/fairness-package'
import { toast } from './feedback'
import { useOnEscape } from './useOnEscape'
import './lottery-fairness.scss'

interface Props {
  onClose: () => void
}

// 抽奖公平性面板：展示种子承诺/揭示，一键离线自验证
export default function LotteryFairness({ onClose }: Props) {
  const version = useLotteryVersion()
  useOnEscape(onClose)
  const [result, setResult] = useState<{ value: VerifyResult; version: number | null; source: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // 打开即锁定承诺哈希（种子已在加载时确定，提前公布也无妨）
  useEffect(() => {
    void ensureSeedCommit().catch(() => toast('种子承诺生成失败，请稍后重试'))
  }, [])

  const drawCount = lotteryConfig.drawLog.filter(e => e.type === 'draw').length

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
      await ensureSeedCommit()
      const blob = new Blob([JSON.stringify(createVerificationPackage(), null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = '抽奖验证.json'
      link.click()
      URL.revokeObjectURL(url)
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
      const value = await verifyVerificationPackage(JSON.parse(await file.text()))
      setResult({ value, version: null, source: '导入文件' })
    } catch {
      setResult({ value: { ok: false, checkedDraws: 0, failedAt: null, reason: '文件不是有效的 JSON 验证数据' }, version: null, source: '导入文件' })
    } finally {
      setBusy(false)
    }
  }

  const visibleResult = result?.version === null || result?.version === version ? result : null

  return (
    <div className="lottery-fairness">
      <button type="button" className="close-btn" aria-label="关闭" onClick={onClose}>✖</button>
      <h2 className="panel-title">🛡 抽奖公平性</h2>

      <p className="fairness-intro">
        本程序使用<strong>种子化随机</strong>，可以用完整验证文件复算每轮抽奖、作废和撤销。
        验证通过表示文件内部的承诺、规则与结果一致；请另行核对开抽前公布的指纹与名单。
        本地验证无法证明公布时间，也无法阻止整份数据被替换。
      </p>

      <section className="fairness-field">
        <h3>种子承诺指纹（开抽前公布）</h3>
        <code className="mono">{lotteryConfig.seedCommit || '生成中…'}</code>
        <p className="hint">{lotteryConfig.seedCommit.length === 8 ? 'FNV-1a（兼容模式，非加密校验）' : 'SHA-256'}。请在开抽前记录并公布此值，验证时与原记录核对。</p>
      </section>

      <section className="fairness-field">
        <h3>当前种子</h3>
        <code className="mono">{lotteryConfig.seed}</code>
        <p className="hint">已记录 {drawCount} 轮抽奖。验证文件包含有序名单、奖项规则、所有操作和最终结果，可在另一设备导入验证。种子公开后，后续结果可预测，建议活动结束后分享文件。</p>
      </section>

      <section className="fairness-actions" style={{ flexWrap: 'wrap' }}>
        <button className="primary" disabled={busy} onClick={handleVerify}>{busy ? '验证中…' : '立即自验证'}</button>
        <button onClick={handleCopy}>复制验证数据</button>
        <button onClick={handleDownload}>下载验证文件</button>
        <button disabled={busy} onClick={() => fileInput.current?.click()}>验证文件</button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={handleImport} />
      </section>

      {visibleResult && (
        <div className={'verify-result ' + (visibleResult.value.ok ? 'ok' : 'fail')} role="status">
          {visibleResult.value.ok
            ? `✓ ${visibleResult.source}验证通过：承诺一致，已复算 ${visibleResult.value.checkedDraws} 轮及全部操作，最终结果一致`
            : `✗ ${visibleResult.source}验证未通过：${visibleResult.value.failedAt === null ? '' : `第 ${visibleResult.value.failedAt + 1} 条记录：`}${visibleResult.value.reason}`}
        </div>
      )}
    </div>
  )
}
