import { test, expect } from '@playwright/test'

// This test requires the dev server running at http://localhost:5175

test('river centerline length and river tiles reasonable', async ({ page }) => {
  await page.goto('http://localhost:5175')
  // wait for R3F canvas to render and river data to be attached
  await page.waitForFunction(() => (window as any).__RIVER_CENTER_LINE__ && (window as any).__RIVER_TILES__)
  const center = await page.evaluate(() => (window as any).__RIVER_CENTER_LINE__)
  const tiles = await page.evaluate(() => (window as any).__RIVER_TILES__)
  // map width (from code) is 80 → require at least 50% coverage
  const mapWidth = 80
  const minCoverage = Math.floor(mapWidth * 0.5)
  expect(Array.isArray(center)).toBeTruthy()
  expect(Array.isArray(tiles)).toBeTruthy()
  const uniqueXs = new Set(center.map((p: any) => p.x))
  expect(uniqueXs.size).toBeGreaterThanOrEqual(minCoverage)
  // require at least 12 river tiles total to be considered non-trivial
  expect(tiles.length).toBeGreaterThanOrEqual(12)
})
