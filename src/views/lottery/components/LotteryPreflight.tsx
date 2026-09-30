import { useEffect, useRef, useState } from 'react'
import { loadUserConfig } from '../core/config-store'
import { isDualScreenSupported } from '../core/lottery-sync'
import { isRehearsal } from '../core/rehearsal'
import { auditionAudio, browserOfflineEnvironment, checkDualScreen, checkImages, checkOffline, collectConfiguredImages } from '../core/preflight'
import type { PreflightCheck } from '../core/preflight'
import { useOnEscape } from './useOnEscape'
import './lottery-preflight.scss'

interface Props { onClose(): void; controlConnected: boolean }
const pending: PreflightCheck = { state: 'checking', detail: '正在检查…' }
const labels = { ready: '已验证', attention: '待确认', failed: '需处理', checking: '检查中' }

export default function LotteryPreflight({ onClose, controlConnected }: Props) {
  useOnEscape(onClose)
  const [images, setImages] = useState(pending)
  const [offline, setOffline] = useState(pending)
  const [audio, setAudio] = useState<PreflightCheck>({ state: 'attention', detail: '请点击试听，并由现场人员确认扬声器有声音。' })
  const [played, setPlayed] = useState(false)
  const stopAudio = useRef<(() => void) | null>(null)
  const [run, setRun] = useState(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    let cancelled = false
    const urls = collectConfiguredImages(loadUserConfig())
    void checkImages(urls).then(result => { if (!cancelled) setImages(result) })
    void checkOffline(browserOfflineEnvironment(urls)).then(result => { if (!cancelled) setOffline(result) })
    return () => { cancelled = true; alive.current = false; stopAudio.current?.() }
  }, [run])

  async function handleAudition() {
    stopAudio.current?.()
    setPlayed(false)
    setAudio({ state: 'checking', detail: '正在打开音频…' })
    try {
      const stop = await auditionAudio()
      if (!alive.current) { stop(); return }
      stopAudio.current = stop
      setPlayed(true)
      setAudio({ state: 'attention', detail: '浏览器已播放试听。请确认现场扬声器有声音，再点「听到了」。' })
    } catch (error) {
      if (alive.current) setAudio({ state: 'failed', detail: error instanceof Error ? error.message : '播放失败，请检查浏览器声音权限。' })
    }
  }

  const checks = [
    { title: '音频', result: audio },
    { title: '奖品图与头像', result: images },
    { title: '离线资源', result: offline },
    { title: '双屏连接', result: checkDualScreen(isDualScreenSupported(), controlConnected, isRehearsal()) },
  ]

  return <div className="lottery-preflight" role="dialog" aria-modal="true" aria-labelledby="preflight-title">
    <div className="preflight-content">
      <button type="button" className="close-btn" aria-label="关闭现场准备检查" onClick={onClose}>✕</button>
      <p className="preflight-eyebrow">开场之前</p>
      <h2 id="preflight-title">现场准备检查</h2>
      <p className="preflight-intro">检查当前设备与已保存配置。连接音响和投屏后，建议完整彩排一轮。</p>
      <div className="preflight-checks">
        {checks.map(({ title, result }) => <section key={title} className={'preflight-check is-' + result.state}>
          <header><h3>{title}</h3><span>{labels[result.state]}</span></header>
          <p aria-live="polite">{result.detail}</p>
          {title === '音频' && <div className="preflight-actions">
            <button type="button" disabled={audio.state === 'checking'} onClick={() => void handleAudition()}>试听当前音频</button>
            {played && <button type="button" onClick={() => { stopAudio.current?.(); setAudio({ state: 'ready', detail: '浏览器播放成功，现场人员已确认能听到声音。' }); setPlayed(false) }}>听到了</button>}
          </div>}
        </section>)}
      </div>
      <button type="button" onClick={() => { setImages(pending); setOffline(pending); setRun(value => value + 1) }}>重新检查资源</button>
    </div>
  </div>
}
