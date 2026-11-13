// IndexedDB 音频仓：用户上传的自定义背景音乐（dataURL）存这里，只存一首（固定键）。
// 与图片仓分库，避免被 gcImages 误删。另在 localStorage 存一个同步可读的标记，
// UI / 播放控制无需异步即可判断"是否有自定义音乐"。

import { createKeyValueStore } from './idb-kv'

const DB_NAME = 'lottery-music'
const STORE = 'music'
const KEY = 'bgm'
const FLAG_KEY = '___lottery_music_custom___'

const withStore = createKeyValueStore(DB_NAME, STORE)

// 是否已上传自定义音乐（同步，供 UI / 播放控制快速判断）
export function hasCustomMusic(): boolean {
  return localStorage.getItem(FLAG_KEY) === '1'
}

// 存入自定义音乐（dataURL）。失败（如配额超限）会抛，由调用方提示。
export async function putMusic(dataUrl: string): Promise<void> {
  await withStore('readwrite', store => store.put(dataUrl, KEY))
  localStorage.setItem(FLAG_KEY, '1')
}

// 取回自定义音乐 dataURL，没有则 null
export async function getMusic(): Promise<string | null> {
  const v = await withStore<string | undefined>('readonly', store => store.get(KEY))
  return v ?? null
}

// 清除自定义音乐（回到内置合成音乐）
export async function clearMusic(): Promise<void> {
  await withStore('readwrite', store => store.delete(KEY))
  localStorage.removeItem(FLAG_KEY)
}
