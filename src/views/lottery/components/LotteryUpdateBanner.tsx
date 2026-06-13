import { useEffect, useState } from 'react'
import { getNeedRefresh, subscribeUpdate, applyUpdate } from '../core/pwa-update'
import lotteryConfig from '../core/lottery-config'
import { useLotteryVersion } from '../core/lottery-store'
import './lottery-update-banner.scss'

// 右下角不打扰横幅：发现新版本时提示，由用户在两轮抽奖之间择机点更新。
// 看场合提示——本场抽奖一旦开始（已抽出中奖人），更新会刷新页面、可能影响进度，
// 此时改为警告措辞、劝主持人抽完再更新；空闲时则正常鼓励更新。始终由用户点击，不自动刷新。
// 「看看更新了什么」可展开本次更新内容：拉 release-notes.json（不在 PWA 预缓存里，fetch 即最新版）。
export default function LotteryUpdateBanner() {
  useLotteryVersion() // 抽奖进度变化时切换提示措辞
  const [needRefresh, setNeedRefresh] = useState(getNeedRefresh())
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState<string[] | null>(null) // null=未拉取，[]=拉取失败/无内容

  useEffect(() => subscribeUpdate(v => {
    setNeedRefresh(v)
    if (v) {
      setDismissed(false) // 又发现新版，重新提示
    }
  }), [])

  if (!needRefresh || dismissed) {
    return null
  }

  async function toggleDetail() {
    if (!expanded && notes === null) {
      try {
        // release-notes.json 不在预缓存清单（globPatterns 不含 json），no-store 拿服务器最新版
        const res = await fetch(import.meta.env.BASE_URL + 'release-notes.json', { cache: 'no-store' })
        const data = await res.json()
        setNotes(Array.isArray(data?.notes) ? data.notes : [])
      } catch {
        setNotes([]) // 拉取失败，标记已尝试
      }
    }
    setExpanded(e => !e)
  }

  // 已抽出过中奖人 = 本场进行中，更新有打断/丢进度风险
  const inProgress = lotteryConfig.cardListWinAll.length > 0
  const variant = inProgress
    ? { cls: ' warn', role: 'alert' as const, icon: '⚠', text: '有新版本，但本场抽奖已开始 —— 更新会刷新页面、可能影响当前进度，建议抽完再更新', apply: '仍要更新', dismiss: '稍后' }
    : { cls: '', role: 'status' as const, icon: '✨', text: '有新版本可用', apply: '立即更新', dismiss: '✕' }

  return (
    <div className={'lottery-update-banner' + variant.cls} role={variant.role}>
      <div className="update-row">
        <span className="update-icon" aria-hidden="true">{variant.icon}</span>
        <span className="update-text">{variant.text}</span>
        <button className="update-apply" onClick={applyUpdate}>{variant.apply}</button>
        <span className="update-dismiss" title="稍后再说" onClick={() => setDismissed(true)}>{variant.dismiss}</span>
      </div>
      <button className="update-detail-toggle" onClick={toggleDetail}>
        看看更新了什么 {expanded ? '▴' : '▾'}
      </button>
      {expanded && (
        notes && notes.length > 0
          ? <ul className="update-notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          : <p className="update-notes-empty">暂时拿不到更新内容</p>
      )}
    </div>
  )
}
