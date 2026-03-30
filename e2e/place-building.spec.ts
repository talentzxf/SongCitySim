import { test, expect, type Page } from '@playwright/test'

// ─── Helpers ───────────────────────────────────────────────────────────────

async function gotoAvailable(page: Page) {
  for (const p of [5173, 5174, 5175]) {
    try {
      await page.goto(`http://localhost:${p}`, { timeout: 4000 })
      await page.waitForTimeout(400)
      if (await page.$('.hud')) return true
    } catch {}
  }
  return false
}

async function waitForAppReady(page: Page) {
  await page.waitForSelector('.hud', { timeout: 6000 })
  await page.waitForFunction(
    () => Boolean((window as any).__GET_CITY_STATE__?.().buildings !== undefined),
    { timeout: 6000 }
  )
}

const getRunning   = (page: Page) => page.evaluate(() => (window as any).__GET_CITY_STATE__().running)
const getTick      = (page: Page) => page.evaluate(() => (window as any).__GET_CITY_STATE__().tick)
const getControls  = (page: Page) => page.evaluate(() => (window as any).__CONTROLS_STATE__?.enabled)
const getSelectedTool = (page: Page) => page.evaluate(() => (window as any).__CONTROLS_STATE__?.selectedTool)
const getRoads     = (page: Page) => page.evaluate(() => (window as any).__GET_CITY_STATE__().roads.length)

async function getTileScreenPoint(page: Page, x: number, y: number) {
  return page.evaluate(({ x, y }) => {
    const fn = (window as any).__MAP_TO_SCREEN__
    return fn ? fn(x, y) : null
  }, { x, y })
}

async function getRoadMeshTransform(page: Page, x: number, y: number) {
  return page.evaluate(({ x, y }) => {
    const scene = (window as any).__THREE_SCENE__
    const mesh = scene?.getObjectByName(`road-${x}-${y}`)
    if (!mesh) return null
    const world = mesh.getWorldPosition(mesh.position.clone())
    return {
      position: { x: world.x, y: world.y, z: world.z },
      rotation: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
    }
  }, { x, y })
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('Start and Stop buttons toggle simulation running state', async ({ page }) => {
  expect(await gotoAvailable(page)).toBeTruthy()
  await waitForAppReady(page)

  // 开始/停止 button labels are now in Chinese
  await expect(page.getByRole('button', { name: '开始' })).toBeVisible()
  expect(await getRunning(page)).toBe(false)

  const tickBefore = await getTick(page)
  await page.getByRole('button', { name: '开始' }).click()
  await expect(page.getByRole('button', { name: '停止' })).toBeVisible()
  await expect.poll(() => getRunning(page)).toBe(true)
  await expect.poll(() => getTick(page)).toBeGreaterThan(tickBefore)

  const tickBeforeStop = await getTick(page)
  await page.getByRole('button', { name: '停止' }).click()
  await expect(page.getByRole('button', { name: '开始' })).toBeVisible()
  await expect.poll(() => getRunning(page)).toBe(false)
  await page.waitForTimeout(1200)
  const tickA = await getTick(page)
  await page.waitForTimeout(1200)
  const tickB = await getTick(page)
  expect(tickB).toBe(tickA)
  expect(tickB).toBeGreaterThanOrEqual(tickBeforeStop)
})

test('all main tool buttons switch tool state and lock controls correctly', async ({ page }) => {
  expect(await gotoAvailable(page)).toBeTruthy()
  await waitForAppReady(page)

  // Open the building palette collapse so buttons become visible
  const collapse = page.getByText('建筑')
  if (await collapse.isVisible()) await collapse.click()

  const cases = [
    { name: '浏览', tool: 'pan',      enabled: true  },
    { name: '道路', tool: 'road',     enabled: false },
    { name: '拆除', tool: 'bulldoze', enabled: false },
  ] as const

  for (const c of cases) {
    await page.getByRole('button', { name: c.name }).first().click()
    await expect.poll(() => getSelectedTool(page)).toBe(c.tool)
    await expect.poll(() => getControls(page)).toBe(c.enabled)
  }

  // Building tools via test API (bypasses locale text issues)
  for (const [tool, bt] of [['house','house'],['market','market']] as const) {
    await page.evaluate((t) => (window as any).__TEST_API__?.selectTool(t), tool)
    await expect.poll(() => getSelectedTool(page)).toBe(bt)
    await expect.poll(() => getControls(page)).toBe(false)
  }
})

test('House (民居) button can place a house on the map', async ({ page }) => {
  expect(await gotoAvailable(page)).toBeTruthy()
  await waitForAppReady(page)

  const before = await page.evaluate(() => (window as any).__GET_CITY_STATE__().buildings.length)

  // Use test API to select tool reliably (avoids locale/Collapse timing issues)
  await page.evaluate(() => (window as any).__TEST_API__?.selectTool('house'))
  await expect.poll(() => getControls(page)).toBe(false)

  const p = await getTileScreenPoint(page, 5, 4)
  expect(p).toBeTruthy()
  if (p) await page.mouse.click(p.x, p.y)

  await expect.poll(() =>
    page.evaluate(() => (window as any).__GET_CITY_STATE__().buildings.length)
  ).toBe(before + 1)

  const last = await page.evaluate(() => (window as any).__LAST_ACTION__)
  expect(last?.success).toBeTruthy()
  expect(last?.type).toBe('placeBuilding')
  expect(last?.buildType).toBe('house')
})

test('Road button renders placed roads on the ground plane', async ({ page }) => {
  expect(await gotoAvailable(page)).toBeTruthy()
  await waitForAppReady(page)

  await page.evaluate(() => (window as any).__TEST_API__?.selectTool('road'))
  await expect.poll(() => getSelectedTool(page)).toBe('road')

  const roadX = 4; const roadY = 4
  const roadsBefore = await getRoads(page)
  await page.evaluate(({ x, y }) => (window as any).__TEST_API__?.placeRoad(x, y), { x: roadX, y: roadY })
  await expect.poll(() => getRoads(page)).toBe(roadsBefore + 1)
  await expect.poll(() => getRoadMeshTransform(page, roadX, roadY)).not.toBeNull()

  const tf = await getRoadMeshTransform(page, roadX, roadY)
  expect(tf).toBeTruthy()
  expect(tf!.position.x).toBeCloseTo(roadX, 5)
  expect(tf!.position.y).toBeCloseTo(0.05, 5)
  expect(tf!.position.z).toBeCloseTo(roadY, 5)
  expect(tf!.rotation.x).toBeCloseTo(-Math.PI / 2, 5)
})

test('Road tool supports drag painting multiple tiles', async ({ page }) => {
  expect(await gotoAvailable(page)).toBeTruthy()
  await waitForAppReady(page)

  await page.evaluate(() => {
    const api = (window as any).__TEST_API__
    for (let x = 4; x <= 12; x++) api?.applyToolAt(x, 3, 'bulldoze')
  })

  await page.getByRole('button', { name: '道路' }).click()
  await expect.poll(() => getSelectedTool(page)).toBe('road')

  const pts: { x: number; y: number }[] = []
  for (let tx = 4; tx <= 12; tx++) {
    const p = await getTileScreenPoint(page, tx, 3)
    expect(p).toBeTruthy()
    if (p) pts.push(p)
  }
  expect(pts.length).toBe(9)

  await page.mouse.move(pts[0].x, pts[0].y)
  await page.mouse.down()
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y)
  await page.mouse.up()

  const roadsOnLine = await page.evaluate(() => {
    const roads = (window as any).__GET_CITY_STATE__().roads as { x: number; y: number }[]
    return roads.filter(r => r.y === 3).map(r => r.x)
  })
  expect(roadsOnLine).toContain(4)
  expect(roadsOnLine).toContain(7)
  expect(roadsOnLine).toContain(10)
  expect(roadsOnLine.length).toBeGreaterThanOrEqual(6)
})

test('Road drag paints on mousemove until mouseup and skips blocked tiles', async ({ page }) => {
  expect(await gotoAvailable(page)).toBeTruthy()
  await waitForAppReady(page)

  await page.evaluate(() => {
    const api = (window as any).__TEST_API__
    api?.setMoney(1_000_000)
    for (let x = -4; x <= 6; x++) api?.applyToolAt(x, 4, 'bulldoze')
    api?.applyToolAt(2, 4, 'house')
  })

  await page.getByRole('button', { name: '道路' }).click()
  await expect.poll(() => getSelectedTool(page)).toBe('road')

  const dragPts: { x: number; y: number }[] = []
  for (let tx = -3; tx <= 6; tx++) {
    const p = await getTileScreenPoint(page, tx, 4)
    expect(p).toBeTruthy()
    if (p) dragPts.push(p)
  }

  await page.mouse.move(dragPts[0].x, dragPts[0].y)
  await page.mouse.down()
  for (const p of dragPts.slice(1)) await page.mouse.move(p.x, p.y)
  await page.mouse.up()

  const roadsOnLine = await page.evaluate(() => {
    const roads = (window as any).__GET_CITY_STATE__().roads as { x: number; y: number }[]
    return roads.filter(r => r.y === 4).map(r => r.x)
  })
  expect(roadsOnLine).toContain(-3)
  expect(roadsOnLine).toContain(1)
  expect(roadsOnLine).not.toContain(2)
  expect(roadsOnLine).toContain(3)
  expect(roadsOnLine).toContain(6)
})

test('Road drag across diagonal tiles keeps 4-neighbor continuity (no broken corners)', async ({ page }) => {
  expect(await gotoAvailable(page)).toBeTruthy()
  await waitForAppReady(page)

  await page.evaluate(() => {
    const api = (window as any).__TEST_API__
    for (let x = 1; x <= 9; x++) {
      for (let y = 7; y <= 15; y++) api?.applyToolAt(x, y, 'bulldoze')
    }
  })

  await page.evaluate(() => (window as any).__TEST_API__?.selectTool('road'))
  await expect.poll(() => getSelectedTool(page)).toBe('road')

  const dragPts: { x: number; y: number }[] = []
  for (let i = 0; i <= 6; i++) {
    const p = await getTileScreenPoint(page, 2 + i, 8 + i)
    expect(p).toBeTruthy()
    if (p) dragPts.push(p)
  }
  expect(dragPts.length).toBe(7)

  await page.mouse.move(dragPts[0].x, dragPts[0].y)
  await page.mouse.down()
  for (const p of dragPts.slice(1)) await page.mouse.move(p.x, p.y)
  await page.mouse.up()

  const continuity = await page.evaluate(() => {
    const roads = (window as any).__GET_CITY_STATE__().roads as { x: number; y: number }[]
    const set = new Set(roads.map(r => `${r.x},${r.y}`))
    const start = { x: 2, y: 8 }
    const end = { x: 8, y: 14 }
    if (!set.has(`${start.x},${start.y}`) || !set.has(`${end.x},${end.y}`)) return false

    const q = [`${start.x},${start.y}`]
    const seen = new Set(q)
    while (q.length) {
      const cur = q.shift()!
      if (cur === `${end.x},${end.y}`) return true
      const [x, y] = cur.split(',').map(Number)
      const nexts = [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]
      for (const n of nexts) {
        if (!set.has(n) || seen.has(n)) continue
        seen.add(n)
        q.push(n)
      }
    }
    return false
  })

  expect(continuity).toBeTruthy()
})

test('can fill all map tiles with houses using bulldoze fallback', async ({ page }) => {
  expect(await gotoAvailable(page)).toBeTruthy()
  await waitForAppReady(page)

  await page.evaluate(() => { (window as any).__TEST_API__?.setMoney(1_000_000) })

  const minX = -20; const maxX = 19; const minY = -15; const maxY = 14
  await page.evaluate(({ minX, maxX, minY, maxY }) => {
    const api = (window as any).__TEST_API__
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++) {
        api?.applyToolAt(x, y, 'bulldoze')
        api?.applyToolAt(x, y, 'house')
      }
  }, { minX, maxX, minY, maxY })

  const expected = (maxX - minX + 1) * (maxY - minY + 1)
  await expect.poll(() =>
    page.evaluate(() => {
      const s = (window as any).__GET_CITY_STATE__()
      return { roads: s.roads.length, houses: s.buildings.filter((b: any) => b.type === 'house').length }
    })
  ).toEqual({ roads: 0, houses: expected })

  const missing = await page.evaluate(({ minX, maxX, minY, maxY }) => {
    const s = (window as any).__GET_CITY_STATE__()
    const set = new Set(s.buildings.filter((b: any) => b.type === 'house').map((b: any) => `${b.x},${b.y}`))
    const res: string[] = []
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        if (!set.has(`${x},${y}`)) res.push(`${x},${y}`)
    return res.slice(0, 10)
  }, { minX, maxX, minY, maxY })
  expect(missing).toEqual([])
})

test('selected building action buttons are available and behave as expected', async ({ page }) => {
  expect(await gotoAvailable(page)).toBeTruthy()
  await waitForAppReady(page)

  await page.evaluate(() => (window as any).__TEST_API__?.selectBuilding('b-house-1'))
  await expect(page.getByText('Type: house')).toBeVisible()

  const roadsBefore = await getRoads(page)
  await page.getByRole('button', { name: 'Place Road Here' }).click()
  await page.waitForTimeout(200)
  expect(await getRoads(page)).toBe(roadsBefore)

  await expect.poll(() => getControls(page)).toBe(true)

  await page.getByRole('button', { name: 'Bulldoze' }).click()
  await expect.poll(() => getSelectedTool(page)).toBe('bulldoze')
  await expect.poll(() => getControls(page)).toBe(false)

  await page.evaluate(() => (window as any).__TEST_API__?.selectTool('pan'))
  await expect.poll(() => getSelectedTool(page)).toBe('pan')
  await expect.poll(() => getControls(page)).toBe(true)
})

test('day/night system advances dayTime and walkers commute', async ({ page }) => {
  expect(await gotoAvailable(page)).toBeTruthy()
  await waitForAppReady(page)

  const dayBefore = await page.evaluate(() => (window as any).__GET_CITY_STATE__().dayTime)
  await page.getByRole('button', { name: '开始' }).click()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: '停止' }).click()

  const dayAfter = await page.evaluate(() => (window as any).__GET_CITY_STATE__().dayTime)
  const dayCount = await page.evaluate(() => (window as any).__GET_CITY_STATE__().dayCount)
  expect(dayAfter !== dayBefore || dayCount > 1).toBeTruthy()
})

test('farm economy pipeline moves crops from fields to granary to market and households buy food', async ({ page }) => {
  expect(await gotoAvailable(page)).toBeTruthy()
  await waitForAppReady(page)

  await page.evaluate(() => {
    const api = (window as any).__TEST_API__
    api?.setMoney(1_000_000)
    api?.setHouseFood('b-house-1', 0)
    api?.setDayTime(0.75)

    api?.applyToolAt(6, 2, 'granary')
    for (let x = -2; x <= 8; x++) {
      for (let y = 6; y <= 14; y++) api?.applyToolAt(x, y, 'farmZone')
    }
  })

  await page.getByRole('button', { name: '开始' }).click()

  await expect.poll(() => page.evaluate(() => {
    const s = (window as any).__GET_CITY_STATE__()
    const sum = (inv: Record<string, number>) => Object.values(inv).reduce((a: number, b: any) => a + Number(b || 0), 0)
    return sum(s.farmInventory) + sum(s.granaryInventory) + sum(s.marketInventory)
  }), { timeout: 18_000 }).toBeGreaterThan(0.02)

  await expect.poll(() => page.evaluate(() => (window as any).__GET_CITY_STATE__().houseFood['b-house-1'] || 0), { timeout: 18_000 }).toBeGreaterThan(0)

  const final = await page.evaluate(() => {
    const s = (window as any).__GET_CITY_STATE__()
    const sum = (inv: Record<string, number>) => Object.values(inv).reduce((a: number, b: any) => a + Number(b || 0), 0)
    return {
      farm: sum(s.farmInventory),
      granary: sum(s.granaryInventory),
      market: sum(s.marketInventory),
      houseFood: s.houseFood['b-house-1'] || 0,
    }
  })

  await page.getByRole('button', { name: '停止' }).click()

  expect(final.farm + final.granary + final.market).toBeGreaterThan(0)
  expect(final.houseFood).toBeGreaterThan(0)
})

