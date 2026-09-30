import { useRef, useState, useMemo } from 'react'
import lotteryConfig from '../core/lottery-config'
import {
  clearUserConfig, loadUserConfig, parseRosterText, parseRosterEntries,
  rosterEntriesToText, parseConfigJson, exportConfigFile, exportWinnersCsv,
  PERF_WARN_ROSTER,
} from '../core/config-store'
import type { PrizeConfig, UserLotteryConfig } from '../core/config-store'
import { toast, appConfirm } from './feedback'
import { THEMES, loadTheme, applyTheme } from '../core/lottery-theme'
import type { ThemeId } from '../core/lottery-theme'
import { compressImageToDataUrl } from '../core/image-utils'
import { persistConfigImages, inlineConfigImages } from '../core/config-images'
import { isImageRef } from '../core/image-store'
import { configChangesProgress, makeConfigApplication, prepareConfig } from '../core/config-apply'
import { isSoundEnabled, setSoundEnabled } from '../core/lottery-sound'
import { isCountdownEnabled, setCountdownEnabled } from '../core/lottery-countdown'
import { hasCustomMusic, putMusic, clearMusic } from '../core/lottery-music-store'
import { AVATAR_STYLES, DEFAULT_AVATAR_STYLE, AVATAR_HEAVY_WARN, generateAvatarFor } from '../core/avatar-styles'
import { useOnEscape } from './useOnEscape'
import './lottery-config-panel.scss'

interface Props {
  onClose: () => void
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export default function LotteryConfigPanel({ onClose }: Props) {
  useOnEscape(onClose)
  // 初始值取当前生效的配置（用户配置或内置默认）
  const [title, setTitle] = useState(lotteryConfig.headerTitle)
  const [prizes, setPrizes] = useState<PrizeConfig[]>(() =>
    lotteryConfig.prizeList.map(p => ({ name: p.name, count: p.count, everyTimeGet: p.everyTimeGet, img: p.img || undefined, presentation: p.presentation ?? 'standard' }))
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
  const [customMusic, setCustomMusic] = useState(hasCustomMusic)
  const [saving, setSaving] = useState(false)
  const [avatarStyle, setAvatarStyle] = useState(() => loadUserConfig()?.avatarStyle ?? DEFAULT_AVATAR_STYLE)
  const [avatarAutoDowngrade, setAvatarAutoDowngrade] = useState(() => loadUserConfig()?.avatarAutoDowngrade ?? false)
  const rosterFileRef = useRef<HTMLInputElement>(null)
  const configFileRef = useRef<HTMLInputElement>(null)
  const musicFileRef = useRef<HTMLInputElement>(null)
  const applyConfig = useMemo(() => makeConfigApplication(() =>
    appConfirm('保存新配置会清空当前抽奖进度并刷新页面，确定吗？', { confirmText: '保存并应用' }),
  ), [])

  const rosterNames = parseRosterText(rosterText)
  const dupCount = rosterNames.length - new Set(rosterNames).size
  const totalPrizeCount = prizes.reduce((sum, p) => sum + (p.count || 0), 0)
  const sampleName = rosterNames[0] || '示'
  const avatarPreviews = useMemo(
    () => AVATAR_STYLES.map(s => ({ id: s.id, label: s.label, uri: generateAvatarFor(sampleName, s.id) })),
    [sampleName],
  )
  const currentAvatarStyle = AVATAR_STYLES.find(s => s.id === avatarStyle)

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
    const result = prepareConfig({ title, prizes, rosterText, avatarStyle, avatarAutoDowngrade })
    if (result.error) toast(result.error)
    return result.config ?? null
  }

  async function handleSave() {
    if (saving) return
    const cfg = buildConfig()
    if (!cfg) return
    setSaving(true)
    try {
      await applyConfig(cfg)
    } catch (error) {
      toast(error instanceof Error && error.message.startsWith('配置保存失败')
        ? error.message : '配置保存失败：请检查浏览器存储空间后重试', 8000)
    } finally {
      setSaving(false)
    }
  }

  async function handleExportConfig() {
    const cfg = buildConfig()
    if (!cfg) return
    const persisted = await persistConfigImages(cfg) // 统一成 idb 引用形态
    const hasImg = persisted.prizes.some(p => isImageRef(p.img))
    if (!hasImg) {
      exportConfigFile(persisted)
      return
    }
    const inline = await appConfirm(
      '配置含奖品图，是否把图片一起打包进文件？\n打包后文件较大、但可直接发给他人使用；选「仅引用」文件小，换设备导入会缺图。',
      { confirmText: '打包图片', cancelText: '仅引用' },
    )
    exportConfigFile(inline ? await inlineConfigImages(persisted) : persisted)
  }

  async function handleMusicFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      await putMusic(await readFileAsDataUrl(file))
      setCustomMusic(true)
      toast('背景音乐已更新，点右上角音乐按钮播放')
    } catch {
      toast('音乐保存失败：文件可能过大或本地存储已满')
    }
  }

  async function handleClearMusic() {
    await clearMusic()
    setCustomMusic(false)
    toast('已恢复内置合成音乐')
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
    setAvatarStyle(cfg.avatarStyle ?? DEFAULT_AVATAR_STYLE)
    setAvatarAutoDowngrade(cfg.avatarAutoDowngrade ?? false)
    toast('配置已载入面板，请检查后点「保存并应用」生效')
  }

  async function handleResetProgress() {
    if (await appConfirm('重置所有抽奖进度？已抽中奖名单与历史将清空，但保留当前配置。此操作不可恢复。', { confirmText: '重置进度' })) {
      lotteryConfig.clearLocalStorage()
      location.reload()
    }
  }

  async function handleRestoreDefaults() {
    if (!(await appConfirm('恢复内置默认配置并清空抽奖进度，确定吗？', { confirmText: '恢复默认' }))) return
    clearUserConfig()
    lotteryConfig.clearLocalStorage()
    location.reload()
  }

  return (
    <div className="lottery-config-panel">
      <button type="button" className="close-btn" aria-label="关闭" onClick={onClose}>✖</button>
      <h2 className="panel-title">抽奖配置</h2>
      <p className="field-hint">标题、名单与奖项规则需保存后生效；更改这些内容会重置进度。只换图片、头像风格或揭晓节奏会保留进度。</p>

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
        <h3>背景音乐</h3>
        <p className="field-hint">
          默认是内置合成的轻音乐（无需音频文件、可离线）。可上传自己的音频替换；点右上角 ♫ 按钮播放/暂停。
        </p>
        <div>
          <button onClick={() => musicFileRef.current?.click()}>上传背景音乐</button>
          <input ref={musicFileRef} type="file" accept="audio/*" hidden onChange={handleMusicFile} />
          {customMusic
            ? <button onClick={handleClearMusic}>恢复内置合成音乐</button>
            : <span className="field-hint" style={{ marginLeft: '8px' }}>当前：内置合成音乐</span>}
        </div>
      </section>

      <section>
        <h3>头像风格</h3>
        <p className="field-hint">没自带头像时的默认生成款。点选即换，保存后生效（不影响已抽进度）。</p>
        <div className="avatar-styles">
          {avatarPreviews.map(p => (
            <button
              key={p.id}
              type="button"
              className={'avatar-style-option' + (avatarStyle === p.id ? ' selected' : '')}
              aria-pressed={avatarStyle === p.id}
              onClick={() => setAvatarStyle(p.id)}
            >
              <img src={p.uri} alt="" />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
        {currentAvatarStyle?.heavy && rosterNames.length > AVATAR_HEAVY_WARN && (
          <p className="perf-warning">
            {avatarAutoDowngrade
              ? `当前 ${rosterNames.length} 人较多，抽奖时会自动改用轻量首字头像（这里仍显示你选的风格）。`
              : `当前 ${rosterNames.length} 人用「${currentAvatarStyle.label}」头像可能卡顿，建议换轻量风格，或打开下方自动降级。`}
          </p>
        )}
        <label className="sound-toggle">
          <input
            type="checkbox"
            checked={avatarAutoDowngrade}
            onChange={e => setAvatarAutoDowngrade(e.target.checked)}
          />
          <span>大名单自动用轻量头像</span>
        </label>
      </section>

      <section>
        <h3>奖项（{prizes.length} 个，共 {totalPrizeCount} 份）</h3>
        <p className="field-hint">
          「总数」是该奖项的获奖名额；「每轮抽取」是点一次「停！」开出的人数。奖品总数不能超过名单人数。
          「简洁」适合连续开奖，「隆重」会延长揭晓停顿与飞出过程；只影响演出，不改变抽奖结果，保存后生效。
        </p>
        <table className="prize-table">
          <thead>
            <tr><th>名称</th><th>总数</th><th>每轮抽取</th><th>揭晓节奏</th><th>奖品图</th><th></th></tr>
          </thead>
          <tbody>
            {prizes.map((p, i) => (
              <tr key={i}>
                <td><input value={p.name} onChange={e => updatePrize(i, { name: e.target.value })} /></td>
                <td><input type="number" min={1} value={p.count} onChange={e => updatePrize(i, { count: Number(e.target.value) })} /></td>
                <td><input type="number" min={1} value={p.everyTimeGet} onChange={e => updatePrize(i, { everyTimeGet: Number(e.target.value) })} /></td>
                <td><select
                  className="prize-presentation-select"
                  aria-label={`第${i + 1}个奖项的揭晓节奏`}
                  value={p.presentation ?? 'standard'}
                  onChange={e => updatePrize(i, { presentation: e.target.value === 'ceremonial' ? 'ceremonial' : 'standard' })}
                >
                  <option value="standard">简洁</option>
                  <option value="ceremonial">隆重</option>
                </select></td>
                <td className="prize-img-cell">
                  {p.img && !isImageRef(p.img) && <img className="prize-img-thumb" src={p.img} alt="奖品图" />}
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
        {rosterNames.length > PERF_WARN_ROSTER && (
          <p className="perf-warning">
            ⚠ 名单 {rosterNames.length} 人较多，3D 旋转抽奖在部分设备上可能不流畅，建议精简到 {PERF_WARN_ROSTER} 人以内或分批抽奖。
          </p>
        )}
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
        <p className="apply-impact">{configChangesProgress({ version: 1, headerTitle: title.trim(), prizes: prizes.map(prize => ({ ...prize, name: prize.name.trim() })), roster: parseRosterEntries(rosterText) })
          ? '本次保存将清空中奖进度和随机流水，应用前会再次确认。'
          : '当前名单与奖项规则未变，保存后保留中奖进度。'}</p>
        <button className="primary" disabled={saving} onClick={handleSave}>{saving ? '保存中…' : '保存并应用'}</button>
        <button onClick={handleExportConfig}>导出配置 JSON</button>
        <button onClick={() => configFileRef.current?.click()}>导入配置 JSON</button>
        <input ref={configFileRef} type="file" accept=".json" hidden onChange={handleConfigFile} />
        <button onClick={() => exportWinnersCsv(lotteryConfig.prizeList)}>导出中奖名单 CSV</button>
        <button className="danger" onClick={handleResetProgress}>重置抽奖进度</button>
        <button onClick={handleRestoreDefaults}>恢复默认配置</button>
      </section>
    </div>
  )
}
