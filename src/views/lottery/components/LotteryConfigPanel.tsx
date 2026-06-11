import { useRef, useState } from 'react'
import lotteryConfig from '../core/lottery-config'
import {
  saveUserConfig, clearUserConfig, loadUserConfig, parseRosterText, parseRosterEntries,
  rosterEntriesToText, parseConfigJson, exportConfigFile, exportWinnersCsv, configHash,
} from '../core/config-store'
import type { PrizeConfig, UserLotteryConfig } from '../core/config-store'
import { toast, appConfirm } from './feedback'
import { THEMES, loadTheme, applyTheme } from '../core/lottery-theme'
import type { ThemeId } from '../core/lottery-theme'
import { compressImageToDataUrl } from '../core/image-utils'
import { isSoundEnabled, setSoundEnabled } from '../core/lottery-sound'
import { isCountdownEnabled, setCountdownEnabled } from '../core/lottery-countdown'
import './lottery-config-panel.scss'

interface Props {
  onClose: () => void
}

export default function LotteryConfigPanel({ onClose }: Props) {
  // 初始值取当前生效的配置（用户配置或内置默认）
  const [title, setTitle] = useState(lotteryConfig.headerTitle)
  const [prizes, setPrizes] = useState<PrizeConfig[]>(() =>
    lotteryConfig.prizeList.map(p => ({ name: p.name, count: p.count, everyTimeGet: p.everyTimeGet, img: p.img || undefined }))
  )
  // 名单文本优先取用户配置原文（保留「名字,头像」行），默认配置则只有名字
  const [rosterText, setRosterText] = useState(() => {
    const userConfig = loadUserConfig()
    return userConfig
      ? rosterEntriesToText(userConfig.roster)
      : lotteryConfig.cardList.map(c => c.name).join('\n')
  })
  const [theme, setTheme] = useState<ThemeId>(loadTheme)
  const [soundOn, setSoundOn] = useState(isSoundEnabled)
  const [countdownOn, setCountdownOn] = useState(isCountdownEnabled)
  const rosterFileRef = useRef<HTMLInputElement>(null)
  const configFileRef = useRef<HTMLInputElement>(null)

  const rosterNames = parseRosterText(rosterText)
  const dupCount = rosterNames.length - new Set(rosterNames).size
  const totalPrizeCount = prizes.reduce((sum, p) => sum + (p.count || 0), 0)

  function updatePrize(index: number, patch: Partial<PrizeConfig>) {
    setPrizes(prev => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  async function handlePrizeImage(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await compressImageToDataUrl(file)
      updatePrize(index, { img: dataUrl })
    } catch {
      toast('图片读取失败，请换一张试试')
    }
  }

  function buildConfig(): UserLotteryConfig | null {
    if (!title.trim()) {
      toast('请填写活动标题')
      return null
    }
    if (prizes.length === 0) {
      toast('至少需要一个奖项')
      return null
    }
    for (const p of prizes) {
      if (!p.name.trim()) {
        toast('奖项名称不能为空')
        return null
      }
      if (!(p.count >= 1) || !(p.everyTimeGet >= 1)) {
        toast('奖项总数和每轮抽取数至少为 1')
        return null
      }
    }
    if (rosterNames.length === 0) {
      toast('抽奖名单不能为空')
      return null
    }
    if (totalPrizeCount > rosterNames.length) {
      toast(`奖品总数（${totalPrizeCount}）超过了名单人数（${rosterNames.length}），请调整奖项数量或补充名单`)
      return null
    }
    return {
      version: 1,
      headerTitle: title.trim(),
      prizes: prizes.map(p => ({ name: p.name.trim(), count: p.count, everyTimeGet: p.everyTimeGet, ...(p.img ? { img: p.img } : {}) })),
      // 不带头像的条目存纯字符串，配置 JSON 更紧凑
      roster: parseRosterEntries(rosterText).map(entry => (entry.avatar ? entry : entry.name)),
    }
  }

  async function handleSave() {
    const cfg = buildConfig()
    if (!cfg) return
    // 配置实质未变（标题/奖项/名单一致，比如只换了奖品图）时保留抽奖进度直接生效
    const activeHash = configHash(
      lotteryConfig.headerTitle,
      lotteryConfig.prizeList.map(p => ({ name: p.name, count: p.count, everyTimeGet: p.everyTimeGet })),
      lotteryConfig.cardList.map(c => c.name),
    )
    const newHash = configHash(cfg.headerTitle, cfg.prizes, cfg.roster)
    if (newHash !== activeHash) {
      if (!(await appConfirm('保存新配置会清空当前抽奖进度并刷新页面，确定吗？', { confirmText: '保存并应用' }))) return
      lotteryConfig.clearLocalStorage()
    }
    saveUserConfig(cfg)
    location.reload()
  }

  function handleExportConfig() {
    const cfg = buildConfig()
    if (!cfg) return
    exportConfigFile(cfg)
  }

  async function handleRosterFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const entries = parseRosterEntries(await file.text())
    if (entries.length === 0) {
      toast('文件里没有解析出任何名字')
      return
    }
    setRosterText(rosterEntriesToText(entries))
  }

  async function handleConfigFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const cfg = parseConfigJson(await file.text())
    if (!cfg) {
      toast('配置文件格式不正确')
      return
    }
    setTitle(cfg.headerTitle)
    setPrizes(cfg.prizes)
    setRosterText(rosterEntriesToText(cfg.roster))
    toast('配置已载入面板，请检查后点「保存并应用」生效')
  }

  async function handleRestoreDefaults() {
    if (!(await appConfirm('恢复内置默认配置并清空抽奖进度，确定吗？', { confirmText: '恢复默认' }))) return
    clearUserConfig()
    lotteryConfig.clearLocalStorage()
    location.reload()
  }

  return (
    <div className="lottery-config-panel">
      <span className="close-btn" onClick={onClose}>✖</span>
      <h2 className="panel-title">抽奖配置</h2>

      <section>
        <h3>活动标题</h3>
        <input className="title-input" value={title} onChange={e => setTitle(e.target.value)} />
      </section>

      <section>
        <h3>主题配色</h3>
        <p className="field-hint">点击立即生效，无需保存。</p>
        <div className="theme-options">
          {THEMES.map(t => (
            <button
              key={t.id}
              className={'theme-option theme-' + t.id + (theme === t.id ? ' selected' : '')}
              onClick={() => { applyTheme(t.id); setTheme(t.id) }}
            >
              {t.name}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>抽奖音效与蓄力</h3>
        <p className="field-hint">音效为纯合成、无需音频文件；倒计时为开抽前 3-2-1 蓄力。点击立即生效，无需保存。</p>
        <label className="sound-toggle">
          <input
            type="checkbox"
            checked={soundOn}
            onChange={e => { setSoundEnabled(e.target.checked); setSoundOn(e.target.checked) }}
          />
          <span>音效{soundOn ? '已开启' : '已关闭'}</span>
        </label>
        <label className="sound-toggle" style={{ marginLeft: '24px' }}>
          <input
            type="checkbox"
            checked={countdownOn}
            onChange={e => { setCountdownEnabled(e.target.checked); setCountdownOn(e.target.checked) }}
          />
          <span>倒计时{countdownOn ? '已开启' : '已关闭'}</span>
        </label>
      </section>

      <section>
        <h3>奖项（{prizes.length} 个，共 {totalPrizeCount} 份）</h3>
        <p className="field-hint">
          「总数」是该奖项的获奖名额；「每轮抽取」是点一次「停！」开出的人数。奖品总数不能超过名单人数。
        </p>
        <table className="prize-table">
          <thead>
            <tr><th>名称</th><th>总数</th><th>每轮抽取</th><th>奖品图</th><th></th></tr>
          </thead>
          <tbody>
            {prizes.map((p, i) => (
              <tr key={i}>
                <td><input value={p.name} onChange={e => updatePrize(i, { name: e.target.value })} /></td>
                <td><input type="number" min={1} value={p.count} onChange={e => updatePrize(i, { count: Number(e.target.value) })} /></td>
                <td><input type="number" min={1} value={p.everyTimeGet} onChange={e => updatePrize(i, { everyTimeGet: Number(e.target.value) })} /></td>
                <td className="prize-img-cell">
                  {p.img && <img className="prize-img-thumb" src={p.img} alt="奖品图" />}
                  <label className="prize-img-upload">
                    {p.img ? '换图' : '传图'}
                    <input type="file" accept="image/*" hidden onChange={e => handlePrizeImage(i, e)} />
                  </label>
                  {p.img && <button onClick={() => updatePrize(i, { img: undefined })}>去掉</button>}
                </td>
                <td><button onClick={() => setPrizes(prev => prev.filter((_, j) => j !== i))}>删除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => setPrizes(prev => [...prev, { name: `奖项${prev.length + 1}`, count: 1, everyTimeGet: 1 }])}>
          + 添加奖项
        </button>
      </section>

      <section>
        <h3>
          抽奖名单（{rosterNames.length} 人{dupCount > 0 ? `，含重名 ${dupCount} 处，会自动区分` : ''}）
        </h3>
        <p className="field-hint">
          每行一个人：「名字」或「名字,头像链接」（http(s) 或 data:image 链接才识别为头像，没有头像时按名字自动生成）。
          可直接从 Excel 整列复制后粘贴（第二列不是链接时只取名字）。文件导入支持 .txt / .csv，规则相同。
        </p>
        <textarea
          value={rosterText}
          onChange={e => setRosterText(e.target.value)}
          placeholder={'张三\n李四\n王五'}
        />
        <div>
          <button onClick={() => rosterFileRef.current?.click()}>从文件导入名单（.txt / .csv）</button>
          <input ref={rosterFileRef} type="file" accept=".txt,.csv" hidden onChange={handleRosterFile} />
        </div>
      </section>

      <section className="panel-actions">
        <button className="primary" onClick={handleSave}>保存并应用</button>
        <button onClick={handleExportConfig}>导出配置 JSON</button>
        <button onClick={() => configFileRef.current?.click()}>导入配置 JSON</button>
        <input ref={configFileRef} type="file" accept=".json" hidden onChange={handleConfigFile} />
        <button onClick={() => exportWinnersCsv(lotteryConfig.prizeList)}>导出中奖名单 CSV</button>
        <button onClick={handleRestoreDefaults}>恢复默认配置</button>
      </section>
    </div>
  )
}
