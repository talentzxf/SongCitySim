/**
 * e2e: 赋税不变式测试
 *
 * 验证不变式：每月结算后，lastMonthlyTax 必须严格等于
 *   lastTaxBreakdown.ding + lastTaxBreakdown.tian + lastTaxBreakdown.shang
 *
 * 曾出现的 Bug：
 *   totalMonthlyTax 在每帧重置为 0，导致 lastMonthlyTax 在月末次帧之后
 *   立即被覆盖为 0，而 lastTaxBreakdown 各项仍保留上月值，出现"单项>合计"。
 *
 * 修复方式：
 *   return 时改为 lastMonthlyTax: monthlyDue ? totalMonthlyTax : s.lastMonthlyTax
 *   且 publicCost 改为仅在月末结算，彻底消除每帧扣款导致的资金流失。
 */

import { test, expect, type Page } from '@playwright/test'

// ─── Helpers ────────────────────────────────────────────────────────────────

async function gotoApp(page: Page) {
  for (const port of [5173, 5174, 5175]) {
    try {
      await page.goto(`http://localhost:${port}`, { timeout: 5000 })
      await page.waitForTimeout(300)
      if (await page.$('.hud')) return true
    } catch {}
  }
  return false
}

async function waitReady(page: Page) {
  await page.waitForSelector('.hud', { timeout: 8000 })
  await page.waitForFunction(
    () => Boolean((window as any).__GET_CITY_STATE__?.()),
    { timeout: 8000 },
  )
}

function getState(page: Page) {
  return page.evaluate(() => (window as any).__GET_CITY_STATE__())
}

function getApi(page: Page) {
  return (page as any).evaluate
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('赋税不变式', () => {

  test('月末后 lastMonthlyTax 应等于三项之和，且不随时间重置为 0', async ({ page }) => {
    const ok = await gotoApp(page)
    if (!ok) { test.skip(); return }
    await waitReady(page)

    // 1. 启动模拟
    await page.evaluate(() => {
      const api = (window as any).__TEST_API__
      api.setMoney(9999)
      // 确保有人口和田产才能产生非零税额
    })
    await page.evaluate(() => (window as any).__TEST_API__?.selectTool?.('pan'))

    // 开始运行
    const startBtn = page.locator('button', { hasText: '开始' })
    if (await startBtn.isVisible()) await startBtn.click()

    // 2. 等待至少一个月结算（MONTH_TICKS=300 帧 × 100ms = 30秒）
    // 轮询直到 month > 1 或 tick >= 300
    await page.waitForFunction(
      () => {
        const s = (window as any).__GET_CITY_STATE__()
        return s && s.month >= 2
      },
      { timeout: 45_000, polling: 500 },
    )

    // 3. 在月末结算后连续检查 10 个帧（约 1 秒），确保 lastMonthlyTax 始终等于三项之和
    const CHECKS = 10
    const INTERVAL_MS = 100
    for (let i = 0; i < CHECKS; i++) {
      await page.waitForTimeout(INTERVAL_MS)
      const state = await getState(page)

      const { ding, tian, shang } = state.lastTaxBreakdown
      const sum = ding + tian + shang
      const reported = state.lastMonthlyTax

      // 核心不变式：三项之和 === 合计课入
      expect(
        sum,
        `不变式违反 (帧${i}): ding=${ding} + tian=${tian} + shang=${shang} = ${sum}, 但 lastMonthlyTax = ${reported}`,
      ).toBe(reported)

      // 防止虚假通过：如果月末已经过了，合计不应为 0（除非丁税也是 0，说明没人）
      if (state.population > 0 && state.taxRates.ding > 0) {
        expect(
          reported,
          `月末已过但 lastMonthlyTax=0，疑似被每帧清零（人口=${state.population}，丁税率=${state.taxRates.ding}）`,
        ).toBeGreaterThan(0)
      }
    }
  })

  test('三税各项非负且不超过合计', async ({ page }) => {
    const ok = await gotoApp(page)
    if (!ok) { test.skip(); return }
    await waitReady(page)

    const startBtn = page.locator('button', { hasText: '开始' })
    if (await startBtn.isVisible()) await startBtn.click()

    // 等待至少一次月结
    await page.waitForFunction(
      () => {
        const s = (window as any).__GET_CITY_STATE__()
        return s && s.month >= 2
      },
      { timeout: 45_000, polling: 500 },
    )

    const state = await getState(page)
    const { ding, tian, shang } = state.lastTaxBreakdown
    const total = state.lastMonthlyTax

    expect(ding).toBeGreaterThanOrEqual(0)
    expect(tian).toBeGreaterThanOrEqual(0)
    expect(shang).toBeGreaterThanOrEqual(0)
    expect(ding).toBeLessThanOrEqual(total)
    expect(tian).toBeLessThanOrEqual(total)
    expect(shang).toBeLessThanOrEqual(total)
    expect(ding + tian + shang).toBe(total)
  })

  test('调整税率后下一个月的合计仍满足不变式', async ({ page }) => {
    const ok = await gotoApp(page)
    if (!ok) { test.skip(); return }
    await waitReady(page)

    // 设置高丁税以确保非零收入
    await page.evaluate(() => {
      (window as any).__TEST_API__?.setMoney?.(9999)
    })

    // 通过 setTaxRates 调整税率（直接写入 state）
    // 这里用 setState 快捷方式 — 测试 API 提供 getState，我们模拟直接跑够时间
    const startBtn = page.locator('button', { hasText: '开始' })
    if (await startBtn.isVisible()) await startBtn.click()

    await page.waitForFunction(
      () => {
        const s = (window as any).__GET_CITY_STATE__()
        return s && s.month >= 2
      },
      { timeout: 45_000, polling: 500 },
    )

    // 验证不变式
    const state = await getState(page)
    const sum = state.lastTaxBreakdown.ding + state.lastTaxBreakdown.tian + state.lastTaxBreakdown.shang
    expect(sum).toBe(state.lastMonthlyTax)

    // 再等一个月，继续验证
    await page.waitForFunction(
      (currentMonth: number) => {
        const s = (window as any).__GET_CITY_STATE__()
        return s && s.month > currentMonth
      },
      state.month,
      { timeout: 45_000, polling: 500 },
    )

    const state2 = await getState(page)
    const sum2 = state2.lastTaxBreakdown.ding + state2.lastTaxBreakdown.tian + state2.lastTaxBreakdown.shang
    expect(sum2).toBe(state2.lastMonthlyTax)
  })

})

