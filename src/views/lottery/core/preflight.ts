import type { UserLotteryConfig } from './config-store'
import { normalizeRoster } from './config-store'
import { getManyImages, isImageRef } from './image-store'
import { getMusic, hasCustomMusic } from './lottery-music-store'

export type CheckState = 'ready' | 'attention' | 'failed' | 'checking'
export interface PreflightCheck { state: CheckState; detail: string }

export function collectConfiguredImages(config: UserLotteryConfig | null): string[] {
  if (!config) return []
  return [...new Set([
    ...config.prizes.map(prize => prize.img),
    ...normalizeRoster(config.roster).map(entry => entry.avatar),
  ].filter((url): url is string => Boolean(url)))]
}

export function loadImage(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const image = new Image()
    const finish = (ok: boolean) => {
      clearTimeout(timeout)
      image.onload = null
      image.onerror = null
      resolve(ok)
    }
    const timeout = setTimeout(() => finish(false), 7000)
    image.onload = () => finish(image.naturalWidth > 0)
    image.onerror = () => finish(false)
    image.src = url
  })
}

export async function checkImages(
  urls: string[],
  dependencies = { resolve: getManyImages, load: loadImage },
): Promise<PreflightCheck> {
  if (!urls.length) return { state: 'ready', detail: '未配置外部图片；头像由本机生成。' }
  try {
    const images = await dependencies.resolve(urls.filter(isImageRef))
    let failed = 0
    // Bounded loading avoids issuing thousands of image requests at once.
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(8, urls.length) }, async () => {
      while (cursor < urls.length) {
        const original = urls[cursor++]
        const url = isImageRef(original) ? images.get(original) : original
        if (!url || !(await dependencies.load(url).catch(() => false))) failed++
      }
    }))
    return failed
      ? { state: 'failed', detail: `${failed} / ${urls.length} 张图片缺失、加载失败或超时；请在配置里重新上传或替换。` }
      : { state: 'ready', detail: `${urls.length} 张配置图片已实际加载。` }
  } catch {
    return { state: 'failed', detail: '图片仓读取失败，请检查浏览器存储权限。' }
  }
}

interface OfflineEnvironment {
  controlled: boolean
  cacheAvailable: boolean
  entryUrl: string
  assetUrls: string[]
  imageUrls: string[]
  cached(url: string): Promise<boolean>
}

export async function checkOffline(environment: OfflineEnvironment): Promise<PreflightCheck> {
  if (!environment.controlled) return { state: 'attention', detail: '当前页面未受离线服务控制。请使用生产预览/正式站点，联网打开一次后再检查。' }
  if (!environment.cacheAvailable) return { state: 'attention', detail: '浏览器未开放离线缓存，无法确认断网后可重新打开。' }
  try {
    const assets = [...new Set([environment.entryUrl, ...environment.assetUrls])]
    const missing = (await Promise.all(assets.map(async url => !(await environment.cached(url))))).filter(Boolean).length
    if (missing) return { state: 'attention', detail: `当前页面所需的 ${assets.length} 个入口/脚本/样式中，${missing} 个未发现离线缓存。` }
    const remoteImages = environment.imageUrls.filter(url => !/^(data:|idb:)/.test(url))
    const uncachedImages = (await Promise.all(remoteImages.map(async url => !(await environment.cached(url))))).filter(Boolean).length
    if (uncachedImages) return { state: 'attention', detail: `页面资源已缓存，但 ${uncachedImages} 张链接图片未缓存，断网后可能缺图；建议改用上传图片。` }
    return { state: 'ready', detail: `${assets.length} 个入口/脚本/样式已缓存，配置图片无未缓存链接。仍请在本机断网刷新一次验收。` }
  } catch {
    return { state: 'attention', detail: '无法读取离线缓存；请用断网刷新进行实际确认。' }
  }
}

export function browserOfflineEnvironment(imageUrls: string[]): OfflineEnvironment {
  const base = new URL(import.meta.env.BASE_URL, location.href)
  return {
    controlled: 'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller),
    cacheAvailable: 'caches' in window,
    entryUrl: new URL('index.html', base).href,
    assetUrls: [...document.querySelectorAll<HTMLScriptElement>('script[src]')].map(script => script.src)
      .concat([...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"], link[rel="modulepreload"]')].map(link => link.href)),
    imageUrls,
    cached: async url => {
      const resource = new URL(url, location.href)
      // Workbox adds revision parameters to local precache entries. Never ignore
      // a configured remote image's query, which may identify a different image.
      const ignoreSearch = resource.origin === location.origin && !resource.search
      return Boolean(await caches.match(resource.href, { ignoreSearch }))
    },
  }
}

export function checkDualScreen(supported: boolean, connected: boolean, rehearsal: boolean): PreflightCheck {
  if (rehearsal) return { state: 'attention', detail: '彩排与正式控制台隔离。回到正式舞台连接并检查双屏。' }
  if (!supported) return { state: 'attention', detail: '浏览器不支持双屏通信，可使用当前窗口操作抽奖。' }
  return connected
    ? { state: 'ready', detail: '控制台心跳已连接；请在投屏设备确认展示画面。' }
    : { state: 'attention', detail: '尚未连接控制台。需要双屏时，关闭面板并打开控制台完成连接。' }
}

function withAudioTimeout<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('音频打开超时，请检查浏览器声音权限后重试')), 5000)
    operation.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

// A successful play/resume only proves browser playback, not the speaker volume.
// The UI asks the operator to confirm hearing it before marking audio ready.
export async function auditionAudio(): Promise<() => void> {
  if (hasCustomMusic()) {
    const data = await getMusic()
    if (!data) throw new Error('自定义音乐文件缺失，请重新上传')
    const audio = new Audio(data)
    audio.volume = 0.5
    try { await withAudioTimeout(audio.play()) }
    catch (error) { audio.pause(); audio.src = ''; throw error }
    const timer = setTimeout(() => audio.pause(), 4000)
    return () => { clearTimeout(timer); audio.pause(); audio.src = '' }
  }
  const AudioCtor = window.AudioContext
  if (!AudioCtor) throw new Error('浏览器不支持音频合成')
  const context = new AudioCtor()
  try {
    await withAudioTimeout(context.resume())
    if (context.state !== 'running') throw new Error('音频仍被浏览器暂停，请检查站点声音权限')
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.12, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.6)
    gain.connect(context.destination)
    const oscillator = context.createOscillator()
    oscillator.frequency.value = 523.25
    oscillator.connect(gain)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.6)
    const timer = setTimeout(() => { void context.close().catch(() => {}) }, 800)
    return () => { clearTimeout(timer); if (context.state !== 'closed') void context.close().catch(() => {}) }
  } catch (error) {
    void context.close().catch(() => {})
    throw error
  }
}
