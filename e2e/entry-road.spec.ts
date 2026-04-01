import { test, expect, type Page } from '@playwright/test'

/**
 * Regression test for seed 241030301:
 *   ENTRY_TILE was computed independently from createHighwayRoads().
 *   When the preferred left-edge tile couldn't route to {x:0,y:0}, the highway
 *   started from a *different* tile while ENTRY_TILE still pointed to the
 *   original tile — which was NOT in s.roads.
 *   Result: isRoadAt(s.roads, ENTRY_TILE) = false → migrants never spawned.
 */

const PROBLEM_SEED = 241030301

// ─── Helpers ────────────────────────────────────────────────────────────────

async function gotoWithSeed(page: Page, seed: number): Promise<boolean> {
  for (const port of [5173, 5174, 5175]) {
    try {
      await page.goto(`http://localhost:${port}/?seed=${seed}`, { timeout: 5000 })
      await page.waitForTimeout(500)
      if (await page.$('.hud')) return true
    } catch { /* try next port */ }
  }
  return false
}

async function waitForAppReady(page: Page) {
  await page.waitForSelector('.hud', { timeout: 10000 })
  await page.waitForFunction(
    () =>
      Boolean((window as any).__GET_CITY_STATE__?.().buildings !== undefined) &&
      Array.isArray((window as any).__GET_CITY_STATE__?.().roads) &&
      (window as any).__GET_CITY_STATE__?.().roads.length > 0 &&
      (window as any).ENTRY_TILE !== undefined,
    { timeout: 10000 },
  )
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test(`seed ${PROBLEM_SEED}: ENTRY_TILE is on the highway (in roads array)`, async ({ page }) => {
  const ok = await gotoWithSeed(page, PROBLEM_SEED)
  expect(ok).toBeTruthy()
  await waitForAppReady(page)

  const { entryOnRoad, entry, roadCount } = await page.evaluate(() => {
    const entry: { x: number; y: number } | undefined = (window as any).ENTRY_TILE
    const roads: { x: number; y: number }[] = (window as any).__GET_CITY_STATE__().roads
    const entryOnRoad = entry ? roads.some(r => r.x === entry.x && r.y === entry.y) : false
    return { entryOnRoad, entry, roadCount: roads.length }
  })

  // Diagnostics on failure
  console.log(`ENTRY_TILE = (${entry?.x}, ${entry?.y}), roads.length = ${roadCount}, onRoad = ${entryOnRoad}`)

  expect(entry).toBeTruthy()
  expect(roadCount).toBeGreaterThan(0)
  expect(entryOnRoad).toBe(true)
})

test(`seed ${PROBLEM_SEED}: HIGHWAY_MAIN_PATH[0] matches ENTRY_TILE`, async ({ page }) => {
  const ok = await gotoWithSeed(page, PROBLEM_SEED)
  expect(ok).toBeTruthy()
  await waitForAppReady(page)

  const match = await page.evaluate(() => {
    const entry: { x: number; y: number } | undefined     = (window as any).ENTRY_TILE
    const path:  { x: number; y: number }[] | undefined   = (window as any).HIGHWAY_MAIN_PATH
    if (!entry || !path || path.length === 0) return false
    return path[0].x === entry.x && path[0].y === entry.y
  })

  expect(match).toBe(true)
})

test(`seed ${PROBLEM_SEED}: migrants spawn after simulation starts`, async ({ page }) => {
  const ok = await gotoWithSeed(page, PROBLEM_SEED)
  expect(ok).toBeTruthy()
  await waitForAppReady(page)

  // Ensure player has enough money for any needed buildings
  await page.evaluate(() => { (window as any).__TEST_API__?.setMoney(99999) })

  // Start simulation
  await page.getByRole('button', { name: '开始' }).click()

  // Wait up to 20 s of real time for at least one migrant (or arriving citizen) to appear
  await page.waitForFunction(
    () => {
      const s = (window as any).__GET_CITY_STATE__?.()
      return (s?.migrants?.length ?? 0) > 0 || (s?.population ?? 0) > 0
    },
    { timeout: 20000 },
  )

  const { migrants, population } = await page.evaluate(() => {
    const s = (window as any).__GET_CITY_STATE__()
    return { migrants: s.migrants?.length ?? 0, population: s.population ?? 0 }
  })

  console.log(`migrants=${migrants}, population=${population}`)
  expect(migrants + population).toBeGreaterThan(0)
})

test(`seed ${PROBLEM_SEED}: after migrants arrive, population increases`, async ({ page }) => {
  const ok = await gotoWithSeed(page, PROBLEM_SEED)
  expect(ok).toBeTruthy()
  await waitForAppReady(page)

  await page.evaluate(() => { (window as any).__TEST_API__?.setMoney(99999) })
  await page.getByRole('button', { name: '开始' }).click()

  // Wait for population ≥ 1 (a migrant has actually moved in)
  await page.waitForFunction(
    () => ((window as any).__GET_CITY_STATE__?.()?.population ?? 0) >= 1,
    { timeout: 30000 },
  )

  const pop = await page.evaluate(() => (window as any).__GET_CITY_STATE__().population)
  expect(pop).toBeGreaterThanOrEqual(1)
})

