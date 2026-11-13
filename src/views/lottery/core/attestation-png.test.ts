import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attestationPngFilename, exportAttestationPng, renderAttestationPng } from './attestation-png'
import { buildAttestation } from './attestation'
import type { AttestationInput } from './attestation'
import { downloadDataUrl } from './poster'

vi.mock('./poster', () => ({ downloadDataUrl: vi.fn() }))

const salt = 'd'.repeat(64)
const input: AttestationInput = {
  title: '年会抽奖',
  seedCommit: '0123456789abcdef'.repeat(4),
  seedSalt: salt,
  rosterCount: 120,
  prizes: [{ name: '一等奖', count: 3, everyTimeGet: 1 }],
  drawLog: [],
  rehearsal: false,
  now: new Date(2026, 10, 13, 9, 0, 0),
}

// jsdom 没有 canvas 实现：用假 2D context 记录画了哪些文字。
let drawn: string[]
function fakeContext() {
  return {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, textAlign: 'left', textBaseline: 'alphabetic',
    measureText: (text: string) => ({ width: [...text].length * 22 }),
    fillText: (text: string) => { drawn.push(text) },
    fillRect: vi.fn(), strokeRect: vi.fn(), scale: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
  }
}

beforeEach(() => {
  drawn = []
  vi.mocked(downloadDataUrl).mockReset()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeContext() as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,iVBORw0KGgo=')
})
afterEach(() => vi.restoreAllMocks())

describe('公证卡 PNG', () => {
  it('画出标题、分组指纹、短码和本机时间说明，不画盐', () => {
    expect(renderAttestationPng(buildAttestation(input)!)).toMatch(/^data:image\/png/)
    const text = drawn.join('\n')
    expect(text).toContain('年会抽奖 开抽前公证卡')
    expect(drawn.filter(t => t === '01234567')).toHaveLength(4)
    expect(drawn.filter(t => t === '89abcdef')).toHaveLength(4)
    expect(text).toContain('短码 01234567')
    expect(text).toContain('名单 120 人')
    expect(text).toContain('本机时间，不能作为公布时间的证明')
    expect(text).toContain('开抽前')
    expect(text).not.toContain(salt)
  })

  it('已抽时顶部和页脚都画红字标签', () => {
    renderAttestationPng(buildAttestation({ ...input, drawLog: [{ type: 'draw' }] })!)
    expect(drawn.filter(t => t === '本场已抽 1 轮，此卡不是开抽前凭证')).toHaveLength(2)
  })

  it('彩排 PNG 带水印，文件名带“彩排”和短码', () => {
    const card = buildAttestation({ ...input, rehearsal: true })!
    renderAttestationPng(card)
    expect(drawn.filter(t => t === '彩排，不具效力').length).toBeGreaterThanOrEqual(2)
    expect(attestationPngFilename(card)).toBe('公证卡-彩排-01234567.png')
    expect(attestationPngFilename(buildAttestation(input)!)).toBe('公证卡-01234567.png')
  })

  it('旧存档无盐卡画限制标签', () => {
    renderAttestationPng(buildAttestation({ ...input, seedSalt: '' })!)
    expect(drawn.join('\n')).toContain('仅绑定种子，不绑定名单和奖项规则')
  })

  it('导出时用带短码的文件名下载', () => {
    expect(exportAttestationPng(buildAttestation(input)!)).toBe(true)
    expect(downloadDataUrl).toHaveBeenCalledWith('data:image/png;base64,iVBORw0KGgo=', '公证卡-01234567.png')
  })

  it('canvas 不可用时返回空串，不触发下载', () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    expect(renderAttestationPng(buildAttestation(input)!)).toBe('')
    expect(exportAttestationPng(buildAttestation(input)!)).toBe(false)
    expect(downloadDataUrl).not.toHaveBeenCalled()
  })
})
