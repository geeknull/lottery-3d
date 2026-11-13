import { useEffect, useState } from 'react'
import { compareFingerprint, groupFingerprint } from '../core/attestation'
import type { Attestation } from '../core/attestation'
import { exportAttestationPng } from '../core/attestation-png'
import { toast } from './feedback'
import './lottery-attestation.scss'

interface Props {
  card: Attestation
  onClose: () => void
}

// 指纹按 8 位一组显示；公证卡和验证结果区共用，保证两处排版一致。
export function FingerprintGroups({ groups, className = '' }: { groups: string[]; className?: string }) {
  const rows = [groups.slice(0, 4), groups.slice(4)].filter(row => row.length > 0)
  return (
    <div className={'fingerprint-groups ' + className}>
      {rows.map((row, i) => (
        <div className="fp-row" key={i}>
          {row.map((group, j) => <span className="fp-group" key={j}>{group}</span>)}
        </div>
      ))}
    </div>
  )
}

// 导入验证文件后：显示文件里的指纹（与卡片同样分组），并用输入框核对公证卡上的指纹。
export function FingerprintCheck({ commit }: { commit: string }) {
  const [input, setInput] = useState('')
  const match = compareFingerprint(input, commit)
  return (
    <section className="fingerprint-check">
      <h3>验证文件中的指纹</h3>
      <FingerprintGroups groups={groupFingerprint(commit)} className="file-fingerprint" />
      <label className="fingerprint-check-label">
        核对卡片指纹
        <input
          type="text"
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder="输入公证卡上的指纹，空格和大小写不影响"
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      {match.state !== 'empty' && (
        <p className={'fingerprint-check-result ' + (match.state === 'match' ? 'ok' : 'fail')} aria-live="polite">
          {match.state === 'match' ? '✓ 与验证文件一致' : `✗ 不一致：第 ${match.group} 组开始不同`}
        </p>
      )}
    </section>
  )
}

// 开抽前公证卡全屏浮层：投屏、拍照、打印共用。全部 React 文本渲染。
export default function LotteryAttestation({ card, onClose }: Props) {
  // 打印时只输出卡片：根节点打标记，@media print 据此隐藏页面其他内容。
  useEffect(() => {
    document.documentElement.classList.add('attestation-open')
    return () => document.documentElement.classList.remove('attestation-open')
  }, [])

  const drawn = card.drawnRounds > 0
  return (
    <div className={'lottery-attestation' + (card.watermark ? ' is-rehearsal' : '')} role="dialog" aria-modal="true" aria-label="开抽前公证卡">
      <div className="attestation-sheet">
        {card.watermark && <div className="attestation-watermark" aria-hidden="true">{card.watermark}</div>}
        <p className={'attestation-stage' + (drawn ? ' drawn' : '')}>{card.stageLabel}</p>
        {card.watermark && <p className="attestation-rehearsal-badge">{card.watermark}</p>}
        <h2 className="attestation-title">{card.title}</h2>

        <section className="attestation-fingerprint">
          <h3>承诺指纹</h3>
          <FingerprintGroups groups={card.groups} />
          <p className="attestation-short">短码 <strong>{card.shortCode}</strong></p>
        </section>

        {card.kind === 'unsalted' && <p className="attestation-unsalted">{card.binding}</p>}

        <dl className="attestation-facts">
          <dt>名单</dt><dd>{card.rosterLine}</dd>
          <dt>奖项</dt>
          <dd><ul>{card.prizeLines.map((line, i) => <li key={i}>{line}</li>)}</ul></dd>
          {card.kind === 'salted' && <><dt>绑定范围</dt><dd>{card.binding}</dd></>}
          <dt>算法</dt><dd>{card.algorithm}</dd>
          <dt>生成时间</dt><dd>{card.generatedAt}（{card.timeNote}）</dd>
        </dl>

        <section className="attestation-verify">
          <h3>核对方法</h3>
          {card.verifySteps.map((step, i) => <p key={i}>{step}</p>)}
        </section>

        {drawn && <p className="attestation-stage drawn footer">{card.stageLabel}</p>}
      </div>

      <div className="attestation-actions">
        <button type="button" onClick={() => { if (!exportAttestationPng(card)) toast('公证卡图片生成失败，请改用打印或拍照') }}>导出 PNG</button>
        <button type="button" onClick={() => window.print()}>打印</button>
        <button type="button" onClick={onClose}>关闭</button>
      </div>
    </div>
  )
}
