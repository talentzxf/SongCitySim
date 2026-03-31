import { test, expect } from '@playwright/test'
import fetch from 'node-fetch'

// This is a lightweight integration test that loads the app via the dev server
// and verifies that with a fixed seed, the world generator creates an ENTRY_TILE
// and that the simulation spawns at least one migrant within a short time window.

test('migrants spawn with seeded map', async ({ page, baseURL }) => {
  // Use a deterministic seed
  const seed = 123456789
  const url = `${baseURL}/?seed=${seed}`
  await page.goto(url)
  // Wait for the app to initialise and expose the debug handles
  await page.waitForFunction(() => (window as any).__WORLD_SEED__ !== undefined, null, { timeout: 5000 })
  const worldSeed = await page.evaluate(() => (window as any).__WORLD_SEED__)
  expect(worldSeed).toBe(seed)

  // Ensure ENTRY_TILE exists
  const entry = await page.evaluate(() => (window as any).ENTRY_TILE || null)
  expect(entry).not.toBeNull()
  // Ensure roads contain the entry tile
  const roads = await page.evaluate(() => (window as any).__TEST_API__?.getRoads ? (window as any).__TEST_API__.getRoads() : (window as any).MAP_ROADS || [])
  const hasEntryRoad = roads.some((r: any) => r.x === entry.x && r.y === entry.y)
  expect(hasEntryRoad).toBe(true)

  // Wait up to 5 seconds for a migrant to spawn
  const migrantAppeared = await page.waitForFunction(() => (window as any).__TEST_API__?.getMigrants ? (window as any).__TEST_API__.getMigrants().length > 0 : (window as any).MIGRANTS && window.MIGRANTS.length > 0, null, { timeout: 5000 })
  expect(migrantAppeared).toBeTruthy()
})
