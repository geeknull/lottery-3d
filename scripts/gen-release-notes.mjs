// 从「本次 push 的提交」生成 public/release-notes.json：
// version=提交数、build=短 SHA、notes=push 范围内非 merge 提交标题(cap 8)。
// CI 在 build 前运行；不 commit 回仓、不打 tag。
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MAX_NOTES = 8

// 纯函数：把提交标题整理成 notes（去两端空白、去空、去重、cap）。便于单测。
export function buildReleaseNotes(subjects, version, build) {
  const seen = new Set()
  const notes = []
  for (const raw of subjects) {
    const s = (raw || '').trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    notes.push(s)
    if (notes.length >= MAX_NOTES) break
  }
  return { version, build, notes }
}

function git(args) {
  return execSync(`git ${args}`, { encoding: 'utf8' }).trim()
}

function main() {
  const before = process.env.BEFORE || ''
  const after = process.env.AFTER || 'HEAD'
  // 有效 before（非空、非全 0）→ 用 push 范围；否则回退最近 8 条
  const validBefore = before && !/^0+$/.test(before)
  const range = validBefore ? `${before}..${after}` : `-${MAX_NOTES}`
  const log = git(`log ${range} --no-merges --pretty=format:%s`)
  const subjects = log ? log.split('\n') : []
  const version = git('rev-list --count HEAD')
  const build = git('rev-parse --short HEAD')
  const data = buildReleaseNotes(subjects, version, build)
  const out = fileURLToPath(new URL('../public/release-notes.json', import.meta.url))
  writeFileSync(out, JSON.stringify(data, null, 2) + '\n')
  console.log(`release-notes.json: version=${version} build=${build} notes=${data.notes.length}`)
}

// 仅在被直接执行时跑 main（被 import/测试时不跑）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
