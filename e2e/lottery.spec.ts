import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { gotoFresh, drawOneRound, closeBanner } from './helpers'

test.describe('抽奖核心流程', () => {
  test('抽奖后剩余数量减少、卡片中奖染色、横幅展示', async ({ page }) => {
    await gotoFresh(page)
    // 默认选中最后一个奖项（三等奖，每轮 10 人）
    const countBefore = await page.locator('.prize-item-count-text').last().textContent()
    expect(countBefore).toBe('20/20')

    await drawOneRound(page)

    // 揭晓横幅出现且有 10 个中奖人
    await expect(page.locator('.lottery-win-banner')).toBeVisible()
    await expect(page.locator('.banner-winner')).toHaveCount(10)
    await closeBanner(page)

    // 剩余数量与中奖染色同步
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')
    await expect(page.locator('.element.prize')).toHaveCount(10)
  })

  test('刷新后抽奖进度恢复', async ({ page }) => {
    await gotoFresh(page)
    await drawOneRound(page)
    await closeBanner(page)
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')

    await page.reload()
    await page.waitForTimeout(3500)
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')
    await expect(page.locator('.element.prize')).toHaveCount(10)
  })

  test('重置数据走界面确认框并清空进度', async ({ page }) => {
    await gotoFresh(page)
    await drawOneRound(page)
    await closeBanner(page)

    // 重置入口已移入配置面板（避免现场误点）
    await page.locator('.config-btn').click()
    await page.locator('.panel-actions .danger').click()
    await expect(page.locator('.confirm-dialog')).toBeVisible()
    await page.locator('.confirm-btns button.primary').click()
    await page.waitForTimeout(3500)
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('20/20')
  })
})

test.describe('中奖作废与补抽', () => {
  test('作废中奖名额退回，可补抽出新的人', async ({ page }) => {
    await gotoFresh(page)
    // 用特等奖（每轮 1 人）便于断言
    await page.locator('.prize-item').first().click()
    await page.waitForTimeout(2600)
    await drawOneRound(page)
    await closeBanner(page)
    await expect(page.locator('.prize-item-count-text').first()).toHaveText('4/5')

    // 打开中奖名单作废（不退回奖池）
    await page.locator('.icon-action:has-text("展示中奖")').click()
    const voidName = (await page.locator('.prize-win-user-name').first().textContent())?.replace('✖', '').trim()
    // 键盘可达：作废按钮是真正的 button，能聚焦并用回车触发（非 hover-only 的 <i>）
    const voidBtn = page.locator('.void-btn').first()
    await voidBtn.focus()
    await expect(voidBtn).toBeFocused()
    await page.keyboard.press('Enter')
    await page.locator('.void-confirm-btns button').nth(1).click() // TA 不再参与
    await expect(page.locator('.prize-item-count-text').first()).toHaveText('5/5')
    await page.locator('.show-all-win-user .close-btn').click()

    // 补抽一轮，新中奖人与被作废的人不同
    await drawOneRound(page)
    await closeBanner(page)
    await page.locator('.icon-action:has-text("展示中奖")').click()
    const newName = (await page.locator('.prize-win-user-name').first().textContent())?.replace('✖', '').trim()
    expect(newName).not.toBe(voidName)
  })
})

test.describe('可验证公平与历史', () => {
  test('抽奖后公平性面板自验证通过，历史记录该轮', async ({ page }) => {
    await gotoFresh(page)
    await drawOneRound(page)
    await closeBanner(page)

    // 公平性自验证
    await page.locator('.fairness-btn').click()
    await page.locator('button:has-text("立即自验证")').click()
    await expect(page.locator('.verify-result.ok')).toBeVisible()
    await page.locator('.lottery-fairness .close-btn').click()

    // 历史时间线记录了这一轮抽奖
    await page.locator('.history-btn').click()
    await expect(page.locator('.history-item.type-draw')).toHaveCount(1)
  })
})

test.describe('撤销整轮', () => {
  test('撤销后名额退回、卡片去染色', async ({ page }) => {
    await gotoFresh(page)
    await drawOneRound(page)
    await closeBanner(page)
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')
    await expect(page.locator('.element.prize')).toHaveCount(10)

    await page.locator('.icon-action:has-text("撤销")').click()
    await page.locator('.confirm-btns button.primary').click()
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('20/20')
    await expect(page.locator('.element.prize')).toHaveCount(0)
  })
})

test.describe('快捷键与主题', () => {
  test('空格控制开始/停止抽奖', async ({ page }) => {
    await gotoFresh(page)
    await page.keyboard.press('Space')
    await page.waitForTimeout(2200)
    await page.keyboard.press('Space')
    await page.waitForTimeout(3000)
    await closeBanner(page)
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')
  })

  test('切换主题改变 data-theme 并持久化', async ({ page }) => {
    await gotoFresh(page)
    await page.locator('.config-btn').click()
    await page.locator('.theme-option.theme-festive').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'festive')

    await page.locator('.lottery-config-panel .close-btn').click()
    await page.reload()
    await page.waitForTimeout(2000)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'festive')
  })
})

test.describe('双屏控制', () => {
  test('控制窗遥控展示窗完成一轮抽奖', async ({ page }) => {
    await gotoFresh(page)

    // 从展示窗打开带配对标识的控制窗。
    const popup = page.waitForEvent('popup')
    await page.locator('.dual-screen-btn').click()
    const control = await popup
    await control.waitForTimeout(2500)

    // 连上：已连接 + 奖项列表 + 展示窗自动隐藏操作 UI
    await expect(control.locator('.control-conn')).toHaveText('● 已连接')
    await expect(control.locator('.control-prize')).toHaveCount(4)
    await expect(page.locator('.lottery-wrap')).toHaveClass(/control-active/)

    // 控制窗选三等奖 → 开始（按钮镜像 spinning）→ 停
    await control.locator('.control-prize').nth(3).click()
    await control.waitForTimeout(3000)
    await control.locator('.control-cta').click()
    await control.waitForFunction(
      () => document.querySelector('.control-cta')?.textContent?.includes('停'),
      { timeout: 8000 },
    )
    await control.locator('.control-cta').click()

    // 中奖名单回传控制窗 + 剩余数同步
    await expect(control.locator('.control-reveal .cr-title')).toHaveText('最近中奖 · 三等奖', { timeout: 12000 })
    await expect(control.locator('.control-prize').nth(3).locator('.cp-remain')).toHaveText('10/20')

    // 关闭控制窗 → 展示窗恢复操作 UI
    await control.close()
    await expect(page.locator('.lottery-wrap')).not.toHaveClass(/control-active/, { timeout: 12000 })
  })
})

test.describe('中奖名单 CSV 导出', () => {
  test('导出内容带 BOM，且对含公式前缀/逗号的名字做转义', async ({ page }) => {
    // 名字同时含公式前缀(=)与逗号，确保导出走到转义分支；
    // 每轮抽满全部 3 人，保证这个名字必进中奖名单（不受随机影响）
    const evilName = '=坑,组长'
    await page.goto('/')
    await page.evaluate((name) => {
      localStorage.removeItem('___lottery___')
      localStorage.setItem('___lottery_countdown___', 'off')
      localStorage.setItem('___lottery_config___', JSON.stringify({
        version: 1,
        headerTitle: '测试抽奖',
        prizes: [{ name: '一等奖', count: 3, everyTimeGet: 3 }],
        roster: [name, '张三', '李四'],
      }))
    }, evilName)
    await page.reload()
    await page.waitForTimeout(3500)

    // 抽一轮，3 人全中
    await drawOneRound(page)
    await closeBanner(page)

    // 配置面板导出 CSV，捕获下载文件
    await page.locator('.config-btn').click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button:has-text("导出中奖名单 CSV")').click(),
    ])
    const content = readFileSync(await download.path(), 'utf-8')

    // 带 BOM、表头正确；名字被双引号包裹、= 前缀被单引号中和，Excel 打开不会当公式执行
    expect(content.startsWith('﻿')).toBe(true)
    expect(content).toContain('奖项,姓名')
    expect(content).toContain('一等奖,"\'=坑,组长"')
  })
})

test.describe('配置保存容错', () => {
  test('localStorage 写入失败时提示且不静默丢配置', async ({ page }) => {
    // 模拟配额超限：只让写配置键抛 QuotaExceededError，其余键正常
    await page.addInitScript(() => {
      const orig = Storage.prototype.setItem
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === '___lottery_config___') throw new DOMException('exceeded', 'QuotaExceededError')
        return orig.call(this, k, v)
      }
    })
    await gotoFresh(page)

    await page.locator('.config-btn').click()
    // 改标题 → 配置哈希变化，触发「保存会清空进度」确认
    await page.locator('.title-input').fill('容错测试标题')
    await page.locator('.panel-actions .primary').click()
    await page.locator('.confirm-dialog .confirm-btns button.primary').click()

    // 出现失败提示，且页面没有因「保存成功」而刷新（配置面板仍在）
    await expect(page.locator('.toast-item:has-text("配置保存失败")')).toBeVisible()
    await expect(page.locator('.lottery-config-panel')).toBeVisible()
  })
})

test.describe('对话框键盘可达', () => {
  test('Escape 关闭配置/公平/历史面板', async ({ page }) => {
    await gotoFresh(page)

    await page.locator('.config-btn').click()
    await expect(page.locator('.lottery-config-panel')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.lottery-config-panel')).toHaveCount(0)

    await page.locator('.fairness-btn').click()
    await expect(page.locator('.lottery-fairness')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.lottery-fairness')).toHaveCount(0)

    await page.locator('.history-btn').click()
    await expect(page.locator('.lottery-history')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.lottery-history')).toHaveCount(0)
  })

  test('确认框叠加时 Escape 不穿透关掉底层配置面板', async ({ page }) => {
    await gotoFresh(page)
    await page.locator('.config-btn').click()
    await page.locator('.title-input').fill('改个标题触发确认')
    await page.locator('.panel-actions .primary').click()
    await expect(page.locator('.confirm-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    // Escape 被确认框守卫拦下：底层配置面板仍在
    await expect(page.locator('.lottery-config-panel')).toBeVisible()
  })
})

test.describe('减少动效', () => {
  test('偏好减少动效时抽奖仍正常完成（彩带/星空降级不影响功能）', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await gotoFresh(page)
    await drawOneRound(page)
    await expect(page.locator('.lottery-win-banner')).toBeVisible()
  })
})

test.describe('背景音乐', () => {
  test('点击音乐按钮切换播放状态，且不再请求已失效的外链', async ({ page }) => {
    const badRequests: string[] = []
    page.on('request', r => { if (r.url().includes('music.163.com')) badRequests.push(r.url()) })
    await gotoFresh(page)

    const btn = page.locator('.music-box')
    await expect(btn).toHaveAttribute('aria-pressed', 'false')
    await btn.click()
    await expect(btn).toHaveAttribute('aria-pressed', 'true') // 无自定义音乐时启动内置合成音
    await btn.click()
    await expect(btn).toHaveAttribute('aria-pressed', 'false')

    expect(badRequests, '不应再请求已失效的网易云外链').toHaveLength(0)
  })
})

test.describe('头像风格设置', () => {
  test('选风格保存后持久化，不清空进度', async ({ page }) => {
    await gotoFresh(page)
    await drawOneRound(page)
    await closeBanner(page)
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')

    await page.locator('.config-btn').click()
    await page.locator('.avatar-style-option:has-text("机器人")').click()
    await page.locator('.panel-actions .primary').click() // 换风格不改 hash，无确认框
    await page.waitForTimeout(3500)

    // 进度仍在（换头像不清进度）
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')
    // 风格已持久化
    await page.locator('.config-btn').click()
    await expect(page.locator('.avatar-style-option:has-text("机器人")')).toHaveClass(/selected/)
  })

  test('大名单选重风格出软提示；开自动降级则实际用轻量', async ({ page }) => {
    const bigRoster = Array.from({ length: 600 }, (_, i) => '选手' + i)
    // 600 人 + bottts + 不降级：出提示
    await page.goto('/')
    await page.evaluate((roster) => {
      localStorage.removeItem('___lottery___')
      localStorage.setItem('___lottery_countdown___', 'off')
      localStorage.setItem('___lottery_config___', JSON.stringify({
        version: 1, headerTitle: '压测', prizes: [{ name: '一等奖', count: 1, everyTimeGet: 1 }],
        roster, avatarStyle: 'bottts',
      }))
    }, bigRoster)
    await page.reload()
    await page.waitForTimeout(4000)
    await page.locator('.config-btn').click()
    await expect(page.locator('.perf-warning:has-text("可能卡顿")')).toBeVisible()

    // 600 人 + bottts + 开降级：第一张卡片头像是轻量（含 linearGradient），不是 bottts
    await page.evaluate((roster) => {
      localStorage.setItem('___lottery_config___', JSON.stringify({
        version: 1, headerTitle: '压测', prizes: [{ name: '一等奖', count: 1, everyTimeGet: 1 }],
        roster, avatarStyle: 'bottts', avatarAutoDowngrade: true,
      }))
    }, bigRoster)
    await page.reload()
    await page.waitForTimeout(4000)
    const src = await page.locator('.element .card-avatar').first().getAttribute('src')
    expect(src).toContain('linearGradient')
  })
})

test.describe('浏览器兼容性降级', () => {
  test('无 BroadcastChannel 时提示且不崩，核心抽奖仍可用', async ({ page }) => {
    // 模拟老浏览器（如 Safari < 15.4）：移除 BroadcastChannel
    await page.addInitScript(() => {
      Object.defineProperty(window, 'BroadcastChannel', { value: undefined, configurable: true, writable: true })
    })
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.removeItem('___lottery___')
      localStorage.removeItem('___lottery_compat_dismissed___')
      localStorage.setItem('___lottery_countdown___', 'off')
    })
    await page.reload()
    await page.waitForTimeout(3500)

    // 兼容性提示出现、内容正确，双屏按钮置灰
    await expect(page.locator('.lottery-compat-notice')).toBeVisible()
    await expect(page.locator('.compat-issues li')).toContainText('双屏遥控')
    await expect(page.locator('.dual-screen-btn')).toHaveClass(/hud-disabled/)

    // 关闭提示后核心抽奖仍可用（展示窗没被 new BroadcastChannel 拖垮）
    await page.locator('.compat-dismiss').click()
    await expect(page.locator('.lottery-compat-notice')).toHaveCount(0)
    await page.locator('.prize-item').nth(3).click()
    await page.waitForTimeout(2600)
    await drawOneRound(page)
    await expect(page.locator('.lottery-win-banner')).toBeVisible()
  })
})
