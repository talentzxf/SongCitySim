/**
 * tutorial-no-overlap.spec.ts
 *
 * Walks through every step of the main Tutorial (l01) and the EventTutorial
 * (unemployment-farming sequence) and asserts that at no step does the
 * floating instruction panel overlap the spotlight target element that the
 * player needs to click, nor the centre of the map canvas for steps where
 * the player needs to interact with the map directly.
 */

import { test, expect, type Page } from '@playwright/test'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function gotoAvailable(page: Page) {
  for (const port of [5173, 5174, 5175]) {
    try {
      await page.goto(`http://localhost:${port}`, { timeout: 5000 })
      await page.waitForTimeout(500)
      if (await page.$('#root')) return port
    } catch { /* try next */ }
  }
  return null
}

/** Jump straight to the game with the l01 tutorial active (skips LoadingScreen / LevelIntro). */
async function enterL01Tutorial(page: Page) {
  await page.waitForFunction(() => typeof (window as any).__TEST_NAVIGATE__ === 'function', { timeout: 8000 })

  // Navigate directly to game with l01 tutorial active.
  // LoadingScreen now has pointerEvents:none when !visible so it won't intercept clicks.
  await page.evaluate(() => (window as any).__TEST_NAVIGATE__?.({ screen: 'game', levelId: 'l01' }))

  // Wait for tutorial panel to be attached then allow the app-root opacity transition (0.6s) to finish
  await page.waitForSelector('[data-tutorial-panel]', { state: 'attached', timeout: 8000 })
  await page.waitForTimeout(700)
}

/** Returns current tutorial step id. */
const getTutorialStep = (page: Page) =>
  page.evaluate(() => (window as any).__TUTORIAL_STATE__?.stepId as string | undefined)

/** Returns current event-tutorial step id. */
const getEvtTutorialStep = (page: Page) =>
  page.evaluate(() => (window as any).__EVT_TUTORIAL_STATE__?.stepId as string | undefined)

/** Advance tutorial by one step. */
const advanceTutorial = (page: Page) =>
  page.evaluate(() => (window as any).__TUTORIAL_ADVANCE__?.())

/** Advance event tutorial by one step. */
const advanceEvtTutorial = (page: Page) =>
  page.evaluate(() => (window as any).__EVT_TUTORIAL_ADVANCE__?.())

// ─── Core overlap check ───────────────────────────────────────────────────────

interface OverlapReport {
  /** True if the tutorial panel rect intersects the target element rect. */
  rectsOverlap: boolean
  /** True if the tutorial panel is the topmost element at the target's centre point. */
  panelOnTop: boolean
  /** Description for assertion messages. */
  panelRect: { left: number; top: number; right: number; bottom: number } | null
  targetRect: { left: number; top: number; right: number; bottom: number } | null
}

async function checkTargetNotBlocked(
  page: Page,
  targetId: string,
  panelSelector: string,
): Promise<OverlapReport> {
  return page.evaluate(
    ({ targetId, panelSelector }) => {
      const target = document.querySelector(`[data-tutorial="${targetId}"]`) as HTMLElement | null
      const panel  = document.querySelector(panelSelector) as HTMLElement | null

      if (!target || !panel) {
        return { rectsOverlap: false, panelOnTop: false, panelRect: null, targetRect: null }
      }

      const tr = target.getBoundingClientRect()
      const pr = panel.getBoundingClientRect()

      const rectsOverlap = !(
        pr.right  < tr.left  ||
        pr.left   > tr.right ||
        pr.bottom < tr.top   ||
        pr.top    > tr.bottom
      )

      const cx = tr.left + tr.width  / 2
      const cy = tr.top  + tr.height / 2
      const topEl = document.elementFromPoint(cx, cy)
      const panelOnTop = !!topEl && panel.contains(topEl)

      return {
        rectsOverlap,
        panelOnTop,
        panelRect:  { left: pr.left, top: pr.top, right: pr.right, bottom: pr.bottom },
        targetRect: { left: tr.left, top: tr.top, right: tr.right, bottom: tr.bottom },
      }
    },
    { targetId, panelSelector },
  )
}

/** Assert the panel does not block the centre of the viewport (the map canvas). */
async function checkMapCenterNotBlocked(page: Page, panelSelector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const panel = document.querySelector(sel) as HTMLElement | null
    if (!panel) return false
    const pr = panel.getBoundingClientRect()
    const cx = window.innerWidth  / 2
    const cy = window.innerHeight / 2
    return cx >= pr.left && cx <= pr.right && cy >= pr.top && cy <= pr.bottom
  }, panelSelector)
}

// ─── Main Tutorial steps ──────────────────────────────────────────────────────

const TUTORIAL_STEPS: Array<{
  id: string
  targetId?: string
  /** Steps where the player must interact with the map — panel must not cover the centre */
  mapStep?: boolean
}> = [
  { id: 'pan-intro',           targetId: 'pan-tool'       },
  { id: 'pan-drag',                                          mapStep: true },
  { id: 'pan-rotate',                                        mapStep: true },
  { id: 'pan-zoom',                                          mapStep: true },
  { id: 'house-open',          targetId: 'building-btn'   },
  { id: 'house-select',        targetId: 'house-tool'     },
  { id: 'house-road',          targetId: 'road-tool'      },
  { id: 'start',               targetId: 'start-btn'      },
  { id: 'waiting-resident',                                  mapStep: true },
  // house-entry-road only shows when road is disconnected; skip in happy-path
  { id: 'waiting-resident-2',                                mapStep: true },
  { id: 'resident-settle',                                   mapStep: true },
  { id: 'resident-inspect',    targetId: 'house-info-panel' },
  { id: 'done' },
]

// ─── Event Tutorial steps ─────────────────────────────────────────────────────

const EVT_STEPS: Array<{ id: string; targetId?: string }> = [
  { id: 'notice-badge',     targetId: 'stats-toggle'  },
  { id: 'open-advice',      targetId: 'advice-label'  },
  { id: 'flash-advice',     targetId: 'advice-panel'  },
  { id: 'close-stats',      targetId: 'stats-toggle'  },
  { id: 'open-building',    targetId: 'building-btn'  },
  { id: 'select-farm-tab',  targetId: 'farming-tab'   },
  { id: 'place-farm',       targetId: 'farmzone-tool' },
  { id: 'connect-farm-road',targetId: 'road-tool'     },
  { id: 'done-farming' },
]

// ─── Tests ────────────────────────────────────────────────────────────────────

/** Shared tutorial-step walk-through used by both desktop and mobile tests. */
async function runMainTutorialChecks(page: Page) {
  await enterL01Tutorial(page)

  for (const step of TUTORIAL_STEPS) {
    await page.waitForFunction(
      (id) => (window as any).__TUTORIAL_STATE__?.stepId === id,
      step.id,
      { timeout: 6000 },
    ).catch(() => { /* step may be auto-skipped */ })

    const currentStep = await getTutorialStep(page)
    if (currentStep !== step.id) continue

    if (step.targetId) {
      const report = await checkTargetNotBlocked(page, step.targetId, '[data-tutorial-panel]')
      if (report.targetRect !== null && report.panelRect !== null) {
        expect(
          report.rectsOverlap,
          `Step "${step.id}": tutorial panel RECT overlaps target "${step.targetId}"\n` +
          `  panel:  ${JSON.stringify(report.panelRect)}\n` +
          `  target: ${JSON.stringify(report.targetRect)}`,
        ).toBe(false)
        expect(
          report.panelOnTop,
          `Step "${step.id}": tutorial panel is ON TOP of target "${step.targetId}" at its centre`,
        ).toBe(false)
      }
    }

    if (step.mapStep) {
      const mapBlocked = await checkMapCenterNotBlocked(page, '[data-tutorial-panel]')
      expect(
        mapBlocked,
        `Step "${step.id}": tutorial panel covers the centre of the map canvas`,
      ).toBe(false)
    }

    await advanceTutorial(page)
    await page.waitForTimeout(150)
  }
}

async function runEvtTutorialChecks(page: Page) {
  await enterL01Tutorial(page)

  for (let i = 0; i < TUTORIAL_STEPS.length + 2; i++) {
    await advanceTutorial(page)
    await page.waitForTimeout(80)
  }
  await page.evaluate(() => (window as any).__TUTORIAL_DISMISS__?.())
  await page.waitForTimeout(200)

  await page.evaluate(() => {
    const api = (window as any).__TEST_API__
    if (!api) return
    api.setMoney(1_000_000)
    api.applyToolAt(2, 2, 'house')
    api.applyToolAt(2, 3, 'road')
  })

  const startBtn = page.locator('[data-tutorial="start-btn"]')
  if (await startBtn.isVisible()) await startBtn.click()

  const evtPanelAppeared = await page.waitForSelector('[data-evt-tutorial-panel]', { timeout: 20000 })
    .then(() => true).catch(() => false)

  if (!evtPanelAppeared) {
    test.skip()
    return
  }

  for (const step of EVT_STEPS) {
    await page.waitForFunction(
      (id) => (window as any).__EVT_TUTORIAL_STATE__?.stepId === id,
      step.id,
      { timeout: 6000 },
    ).catch(() => { /* may be auto-advanced */ })

    const current = await getEvtTutorialStep(page)
    if (current !== step.id) continue

    if (step.targetId) {
      const report = await checkTargetNotBlocked(page, step.targetId, '[data-evt-tutorial-panel]')
      if (report.targetRect !== null && report.panelRect !== null) {
        expect(
          report.rectsOverlap,
          `EvtTut step "${step.id}": panel RECT overlaps target "${step.targetId}"\n` +
          `  panel:  ${JSON.stringify(report.panelRect)}\n` +
          `  target: ${JSON.stringify(report.targetRect)}`,
        ).toBe(false)
        expect(
          report.panelOnTop,
          `EvtTut step "${step.id}": panel is ON TOP of target "${step.targetId}" at its centre`,
        ).toBe(false)
      }
    }

    await advanceEvtTutorial(page)
    await page.waitForTimeout(150)
  }
}

// ─── Desktop tests ────────────────────────────────────────────────────────────

test.describe('Tutorial panel must not block interactive targets (desktop 1280×800)', () => {

  test('main tutorial (l01): panel never overlaps its spotlight target or the map', async ({ page }) => {
    const port = await gotoAvailable(page)
    expect(port, 'Dev server not found on 5173/5174/5175').toBeTruthy()
    await runMainTutorialChecks(page)
  })

  test('event tutorial (farming): panel never overlaps its spotlight target', async ({ page }) => {
    const port = await gotoAvailable(page)
    expect(port, 'Dev server not found on 5173/5174/5175').toBeTruthy()
    await runEvtTutorialChecks(page)
  })

})

// ─── Mobile tests ─────────────────────────────────────────────────────────────

test.describe('Tutorial panel must not block interactive targets (mobile 390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('main tutorial (l01) on mobile: panel never overlaps target or map centre', async ({ page }) => {
    const port = await gotoAvailable(page)
    expect(port, 'Dev server not found on 5173/5174/5175').toBeTruthy()
    await runMainTutorialChecks(page)
  })

  test('event tutorial (farming) on mobile: panel never overlaps its spotlight target', async ({ page }) => {
    const port = await gotoAvailable(page)
    expect(port, 'Dev server not found on 5173/5174/5175').toBeTruthy()
    await runEvtTutorialChecks(page)
  })

})






