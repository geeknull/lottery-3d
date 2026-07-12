import { useEffect, useState } from 'react'
import { getNeedRefresh, subscribeUpdate, applyUpdate } from '../core/pwa-update'
import lotteryConfig from '../core/lottery-config'
import { useLotteryVersion } from '../core/lottery-store'
import './lottery-update-banner.scss'

// 右下角不打扰横幅：发现新版本时提示，由用户在两轮抽奖之间择机点更新。
// 看场合提示——本场抽奖一旦开始（已抽出中奖人），更新会刷新页面、可能影响进度，
// 此时改为警告措辞、劝主持人抽完再更新；空闲时则正常鼓励更新。始终由用户点击，不自动刷新。
// 「看看更新了什么」可展开本次更新内容：拉 release-notes.json（不在 PWA 预缓存里，fetch 即最新版）。
// 该文件在部署时按本次 push 的提交自动生成，故永远是最新说明，notes 非空即展示。
type Detail =
  | { kind: 'notes', items: string[] } // 本次发布的新说明
  | { kind: 'none' } // 无说明（notes 为空，罕见）
  | { kind: 'error' } // 拉取失败

export default function LotteryUpdateBanner() {
  useLotteryVersion() // 抽奖进度变化时切换提示措辞
  const [needRefresh, setNeedRefresh] = useState(getNeedRefresh())
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<Detail | null>(null) // null=未拉取

  useEffect(() => subscribeUpdate(v => {
    setNeedRefresh(v)
    if (v) {
      setDismissed(false) // 又发现新版，重新提示
    }
  }), [])

  if (!needRefresh || dismissed) {
    return null
  }

  async function loadDetail(): Promise<Detail> {
    try {
      // release-notes.json 不在预缓存清单（globPatterns 不含 json），no-store 拿服务器最新版
      const res = await fetch(import.meta.env.BASE_URL + 'release-notes.json', { cache: 'no-store' })
      if (!res.ok) {
        return { kind: 'error' }
      }
      const data = await res.json()
      const items = Array.isArray(data?.notes)
        ? data.notes.filter((n: unknown): n is string => typeof n === 'string')
        : []
      return items.length > 0 ? { kind: 'notes', items } : { kind: 'none' }
    } catch {
      return { kind: 'error' }
    }
  }

  async function toggleDetail() {
    if (!expanded && detail === null) {
      setDetail(await loadDetail())
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
        <button type="button" className="update-dismiss" title="稍后再说" onClick={() => setDismissed(true)}>{variant.dismiss}</button>
      </div>
      <button className="update-detail-toggle" onClick={toggleDetail}>
        看看更新了什么 {expanded ? '▴' : '▾'}
      </button>
      {expanded && detail && (
        detail.kind === 'notes'
          ? <ul className="update-notes">{detail.items.map((n, i) => <li key={i}>{n}</li>)}</ul>
          : <p className="update-notes-empty">{detail.kind === 'error' ? '暂时拿不到更新内容' : '本次更新暂无说明'}</p>
      )}
    </div>
  )
}
