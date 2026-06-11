import { useRef, useState } from 'react'
import lotteryConfig from './lottery-config'
import {
  saveUserConfig, clearUserConfig, parseRosterText, parseConfigJson,
  exportConfigFile, exportWinnersCsv,
} from './config-store'
import type { PrizeConfig, UserLotteryConfig } from './config-store'
import { toast, appConfirm } from './feedback'
import './lottery-config-panel.scss'

interface Props {
  onClose: () => void
}

export default function LotteryConfigPanel({ onClose }: Props) {
  // 初始值取当前生效的配置（用户配置或内置默认）
  const [title, setTitle] = useState(lotteryConfig.headerTitle)
  const [prizes, setPrizes] = useState<PrizeConfig[]>(() =>
    lotteryConfig.prizeList.map(p => ({ name: p.name, count: p.count, everyTimeGet: p.everyTimeGet }))
  )
  const [rosterText, setRosterText] = useState(() => lotteryConfig.cardList.map(c => c.name).join('\n'))
  const rosterFileRef = useRef<HTMLInputElement>(null)
  const configFileRef = useRef<HTMLInputElement>(null)

  const rosterNames = parseRosterText(rosterText)
  const dupCount = rosterNames.length - new Set(rosterNames).size
  const totalPrizeCount = prizes.reduce((sum, p) => sum + (p.count || 0), 0)

  function updatePrize(index: number, patch: Partial<PrizeConfig>) {
    setPrizes(prev => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
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
      prizes: prizes.map(p => ({ name: p.name.trim(), count: p.count, everyTimeGet: p.everyTimeGet })),
      roster: rosterNames,
    }
  }

  async function handleSave() {
    const cfg = buildConfig()
    if (!cfg) return
    if (!(await appConfirm('保存新配置会清空当前抽奖进度并刷新页面，确定吗？', { confirmText: '保存并应用' }))) return
    saveUserConfig(cfg)
    lotteryConfig.clearLocalStorage()
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
    const names = parseRosterText(await file.text())
    if (names.length === 0) {
      toast('文件里没有解析出任何名字')
      return
    }
    setRosterText(names.join('\n'))
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
    setRosterText(cfg.roster.join('\n'))
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
        <h3>奖项（{prizes.length} 个，共 {totalPrizeCount} 份）</h3>
        <p className="field-hint">
          「总数」是该奖项的获奖名额；「每轮抽取」是点一次「停！」开出的人数。奖品总数不能超过名单人数。
        </p>
        <table className="prize-table">
          <thead>
            <tr><th>名称</th><th>总数</th><th>每轮抽取</th><th></th></tr>
          </thead>
          <tbody>
            {prizes.map((p, i) => (
              <tr key={i}>
                <td><input value={p.name} onChange={e => updatePrize(i, { name: e.target.value })} /></td>
                <td><input type="number" min={1} value={p.count} onChange={e => updatePrize(i, { count: Number(e.target.value) })} /></td>
                <td><input type="number" min={1} value={p.everyTimeGet} onChange={e => updatePrize(i, { everyTimeGet: Number(e.target.value) })} /></td>
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
          每行一个名字。可直接从 Excel 整列复制后粘贴（每行若含逗号或制表符，只取第一列）。
          文件导入支持 .txt / .csv，规则相同。无需提供头像，系统会按名字自动生成。
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
