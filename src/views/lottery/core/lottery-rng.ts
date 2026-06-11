// 种子化伪随机数发生器（mulberry32）：同种子必产生相同序列，
// 让抽奖结果可被任何人用「种子 + 名单」离线复算验证。

export interface Rng {
  next(): number // [0,1)
  nextInt(min: number, max: number): number // [min,max] 闭区间
  getState(): number // 当前内部状态（uint32），可持久化后用 rngFromState 续接
}

// 内部状态就是单个 uint32，便于序列化随抽奖进度持久化
export function rngFromState(state: number): Rng {
  let a = state >>> 0
  const rng: Rng = {
    next() {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    nextInt(min, max) {
      return min + Math.floor(rng.next() * (max - min + 1))
    },
    getState() {
      return a >>> 0
    },
  }
  return rng
}

// 新建一个以 seed 为初始状态的发生器
export function createRng(seed: number): Rng {
  return rngFromState(seed)
}

// 生成一个随机种子（优先用 CSPRNG，保证不可预测）
export function randomSeed(): number {
  const cryptoObj = globalThis.crypto
  if (cryptoObj?.getRandomValues) {
    const arr = new Uint32Array(1)
    cryptoObj.getRandomValues(arr)
    return arr[0]
  }
  return Math.floor(Math.random() * 0x100000000)
}

// 种子的承诺哈希（SHA-256）：抽奖开始前公布它，结束后公布种子，
// 任何人都能验证「种子没被根据结果改过」
export async function hashSeed(seed: number): Promise<string> {
  const data = new TextEncoder().encode(`lottery-3d-seed:${seed >>> 0}`)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// 离线复算：用种子从 pool 里不放回抽取 count 个，返回抽中序列。
// 验证者拿「种子 + 当时的池子 + 抽取数」跑这个函数，结果应与现场一致。
export function replaySequence(seed: number, pool: string[], count: number): string[] {
  const rng = createRng(seed)
  const copy = [...pool]
  const picked: string[] = []
  for (let i = 0; i < count && copy.length > 0; i++) {
    const idx = rng.nextInt(0, copy.length - 1)
    picked.push(copy.splice(idx, 1)[0])
  }
  return picked
}
