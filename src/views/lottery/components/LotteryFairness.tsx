import { useEffect, useState } from 'react'
import lotteryConfig from '../core/lottery-config'
import { useLotteryVersion } from '../core/lottery-store'
import { ensureSeedCommit, verifyCurrent } from '../core/lottery-fairness'
import type { VerifyResult } from '../core/lottery-fairness'
import { toast } from './feedback'
import './lottery-fairness.scss'

interface Props {
  onClose: () => void
}

// 抽奖公平性面板：展示种子承诺/揭示，一键离线自验证
export default function LotteryFairness({ onClose }: Props) {
  useLotteryVersion()
  const [result, setResult] = useState<VerifyResult | null>(null)

  // 打开即锁定承诺哈希（种子已在加载时确定，提前公布也无妨）
  useEffect(() => {
    void ensureSeedCommit()
  }, [])

  const drawCount = lotteryConfig.drawLog.filter(e => e.type === 'draw').length

  function handleVerify() {
    const r = verifyCurrent()
    setResult(r)
  }

  async function handleCopy() {
    const payload = JSON.stringify({
      seed: lotteryConfig.seed,
      seedCommit: lotteryConfig.seedCommit,
      draws: lotteryConfig.drawLog
        .filter(e => e.type === 'draw')
        .map(e => ({ prize: e.prizeName, winners: e.winnerNames, poolSize: e.poolIds?.length, rngStateBefore: e.rngStateBefore })),
    }, null, 2)
    try {
      await navigator.clipboard.writeText(payload)
      toast('验证数据已复制到剪贴板')
    } catch {
      toast('复制失败，请手动选择复制')
    }
  }

  return (
    <div className="lottery-fairness">
      <span className="close-btn" onClick={onClose}>✖</span>
      <h2 className="panel-title">🛡 抽奖公平性</h2>

      <p className="fairness-intro">
        本程序使用<strong>种子化随机</strong>：开抽前公布种子的指纹（承诺），结束后公布种子本身。
        任何人都能用「种子 + 名单」离线复算出完全相同的中奖结果——主办方无法暗箱操作。
      </p>

      <section className="fairness-field">
        <h3>种子承诺指纹（开抽前公布）</h3>
        <code className="mono">{lotteryConfig.seedCommit || '生成中…'}</code>
        <p className="hint">SHA-256，开抽前即固定。它能证明种子是预先定好的，不是看了结果再改的。</p>
      </section>

      <section className="fairness-field">
        <h3>种子（结束后揭示）</h3>
        <code className="mono">{lotteryConfig.seed}</code>
        <p className="hint">已记录 {drawCount} 轮抽奖。把种子和名单交给任何人，都能复算验证。</p>
      </section>

      <section className="fairness-actions">
        <button className="primary" onClick={handleVerify}>立即自验证</button>
        <button onClick={handleCopy}>复制验证数据</button>
      </section>

      {result && (
        <div className={'verify-result ' + (result.ok ? 'ok' : 'fail')}>
          {result.ok
            ? `✓ 验证通过：用种子复算了 ${result.checkedDraws} 轮，中奖结果与现场完全一致`
            : `✗ 验证未通过：第 ${(result.failedAt ?? 0) + 1} 条记录与种子复算结果不符`}
        </div>
      )}
    </div>
  )
}
