/**
 * 纯工具函数、建筑定义、物流辅助、入口公路生成
 */
import configData from '../config/buildings-and-citizens.json'
import { BUILDING_REGISTRY } from '../config/buildings/_loader'
import { JOB_REGISTRY } from '../config/jobs/_loader'
import { GOODS_REGISTRY } from '../config/goods/_loader'
import worldGenConfig from '../config/world-gen'
import { MONTH_TICKS } from '../config/simulation'
import {
  isRiverAt, isMountainAt, isOreVeinAt, isForestAt, getMountainHeight,
  MAP_SIZE_X, MAP_SIZE_Y,
} from './worldgen'
import type {
  BuildingType, Profession, CropType, CropInventory,
  Building, MarketConfig, FarmZone, Peddler, Migrant, Walker, OxCart, MarketBuyer,
  CitizenNeeds, Gender,
} from './types'

// ─── Re-exported terrain helpers ─────────────────────────────────────────
export { isRiverAt, isMountainAt, isOreVeinAt, isForestAt, getMountainHeight, MAP_SIZE_X, MAP_SIZE_Y } from './worldgen'
export { isAnyForestAt, isMountainForestAt } from './worldgen'

// ─── Clamp / round helpers ────────────────────────────────────────────────
export function clamp01(v: number) { return Math.max(0, Math.min(1, v)) }
export function clampFood(v: number) { return Math.max(0, Math.min(30, Math.round(v * 10) / 10)) }
export function clampCrop(v: number) { return Math.max(0, Math.round(v * 100) / 100) }
export function tileKey(x: number, y: number) { return `${x},${y}` }

// ─── Building definitions ─────────────────────────────────────────────────
export type BuildingDef = { cost: number; capacity: number; workerSlots: number; needBonus: Partial<CitizenNeeds> }

/**
 * 唯一数据来源：直接从各建筑的 config.json（经 BUILDING_REGISTRY 加载）派生。
 * 不再需要手动维护，也不再依赖 buildings-and-citizens.json 的 buildings 节。
 */
export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = Object.fromEntries(
  Object.entries(BUILDING_REGISTRY).map(([id, b]) => [
    id,
    { cost: b.cost, capacity: b.capacity, workerSlots: b.workerSlots, needBonus: b.needBonus ?? {} },
  ])
) as Record<BuildingType, BuildingDef>

/** 建筑占地（格）——直接读 config.json 的 footprint，默认 1×1。*/
export function getBuildingSize(bt: BuildingType): { w: number; h: number } {
  return BUILDING_REGISTRY[bt]?.footprint ?? { w: 1, h: 1 }
}

export const BUILDING_COST: Record<BuildingType, number> = Object.entries(BUILDING_DEFS).reduce(
  (acc, [k, v]) => { acc[k as BuildingType] = v.cost; return acc },
  {} as Record<BuildingType, number>
)

export const PROFESSION_BY_BUILDING: Partial<Record<BuildingType, Profession>> = Object.fromEntries(
  Object.values(JOB_REGISTRY).flatMap(job =>
    job.buildingIds.map(bId => [bId, job.id as Profession])
  )
) as Partial<Record<BuildingType, Profession>>

/** 所有作物类型——从 goods/ 里 category === 'crop' 的条目派生。 */
export const CROP_KEYS = Object.values(GOODS_REGISTRY)
  .filter(g => g.category === 'crop')
  .map(g => g.id) as CropType[]

// ─── Economy constants ────────────────────────────────────────────────────
export const ECONOMY = {
  arableThreshold:            configData.economy?.arableThreshold            ?? 0.58,
  farmProductionPerTick:      configData.economy?.farmProductionPerTick      ?? 0.018,
  farmToGranaryRatePerTick:   configData.economy?.farmToGranaryRatePerTick   ?? 0.22,
  granaryToMarketRatePerTick: configData.economy?.granaryToMarketRatePerTick ?? 0.18,
  householdBuyTime:           configData.economy?.householdBuyTime           ?? 0.79,
  householdDailyBuyBase:      configData.economy?.householdDailyBuyBase      ?? 0.45,
  householdDailyBuyPerResident: configData.economy?.householdDailyBuyPerResident ?? 0.34,
}

export const BRIDGE_BASE_COST       = 80
export const FOREST_CLEAR_COST         = 25   // 伐木清路每格额外费用
// ─── Resource tile initial health ─────────────────────────────────────────
export const ORE_VEIN_INITIAL_HEALTH   = 600  // 铁矿脉初始储量（单位：矿石）
export const FOREST_TILE_INITIAL_HEALTH = 400 // 林地初始储量（单位：木材）
export const GRASSLAND_TILE_INITIAL_HEALTH = 300 // 草地初始储量（单位：牧草）
export const GRANARY_CAPACITY_PER   = 200
export const MARKET_TOTAL_SLOTS     = 6
export const MARKET_CAP_PER_SHOP    = 25
export const DEFAULT_MARKET_CFG: MarketConfig = { shopkeepers: 4, peddlers: 2 }
export const MINE_CAPACITY_PER      = 60
export const SMITH_CAPACITY_PER     = 20
export const ORE_PER_MINER_DAY      = 3
export const ORE_PER_TOOL           = 2
export const FARM_TOOL_PRICE        = 40
export const TOOL_EFFICIENCY_BONUS  = 1.5
export const TOOL_DURABILITY_MAX    = 100
export const TOOL_WEAR_PER_DAY      = 4
export const TOOL_DURABILITY_LOW    = 20
export const PEDDLER_MAX_STEPS      = 30
export const PEDDLER_SPEED          = 3.5
export const PEDDLER_CARRY_FOOD     = 10
export const PEDDLER_CARRY_TOOLS    = 2
export const PEDDLER_SELL_FOOD      = 5
export const PEDDLER_FOOD_THRESH    = 10
// 采木场 / 造纸坊
export const LUMBER_CAPACITY_PER    = 80   // 每座采木场的木材上限
export const TIMBER_PER_LOGGER_DAY  = 2    // 每名伐木工人每日产出木材
export const PAPERMILL_CONSUME_PER_DAY = 1 // 造纸坊每日消耗木材

// ─── Disease constants ────────────────────────────────────────────────────
export const SICK_DEATH_TICKS      = MONTH_TICKS * 3   // 连续患病超过 3 个月 → 死亡
export const DEAD_SPREAD_THRESHOLD = 2
export const DEAD_SPREAD_RADIUS    = 2
export const DEAD_SPREAD_CHANCE    = 0.0006

// ─── Inventory helpers ─────────────────────────────────────────────────────
export function createEmptyInventory(): CropInventory {
  return { rice: 0, millet: 0, wheat: 0, soybean: 0, vegetable: 0, tea: 0 }
}
export function inventoryTotal(inv: CropInventory) {
  return CROP_KEYS.reduce((s, k) => s + inv[k], 0)
}
export function cropPrice(k: CropType): number { return GOODS_REGISTRY[k]?.price ?? 4 }

export function transferInventory(from: CropInventory, to: CropInventory, maxAmount: number) {
  if (maxAmount <= 0) return 0
  const total = inventoryTotal(from); if (total <= 0) return 0
  const amount = Math.min(maxAmount, total)
  let moved = 0
  for (const k of CROP_KEYS) {
    const take = Math.min(from[k], clampCrop(amount * (from[k] / total)))
    from[k] = clampCrop(from[k] - take); to[k] = clampCrop(to[k] + take); moved += take
  }
  return clampCrop(moved)
}
export function consumeInventory(from: CropInventory, maxAmount: number) {
  if (maxAmount <= 0) return 0
  const total = inventoryTotal(from); if (total <= 0) return 0
  const amount = Math.min(maxAmount, total); let consumed = 0
  for (const k of CROP_KEYS) {
    if (consumed >= amount) break
    const take = Math.min(from[k], amount - consumed)
    from[k] = clampCrop(from[k] - take); consumed += take
  }
  return clampCrop(consumed)
}

// ─── Terrain helpers ──────────────────────────────────────────────────────
export function terrainFertilityAt(x: number, y: number) {
  const wave = (Math.sin(x * 0.19) + Math.cos(y * 0.23) + Math.sin((x + y) * 0.11)) / 3
  return clamp01(0.55 + wave * 0.28)
}
export function isNearRiver(x: number, y: number) {
  if (isRiverAt(x, y)) return false
  return isRiverAt(x + 1, y) || isRiverAt(x - 1, y) || isRiverAt(x, y + 1) || isRiverAt(x, y - 1)
}
export function terrainSuitabilityAt(x: number, y: number) { return isNearRiver(x, y) }
export function cropForTile(x: number, y: number): CropType {
  if (isNearRiver(x, y)) return 'rice'
  // 茶叶只产自茶园（山地），不随机分配给平地粮田
  const grainKeys = CROP_KEYS.filter(k => k !== 'tea')
  const idx = Math.abs(Math.floor((x * 31 + y * 17 + Math.sin(x * 0.3 + y * 0.2) * 1000))) % grainKeys.length
  return grainKeys[idx]
}

// ─── Spatial helpers ──────────────────────────────────────────────────────
export function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}
export function roadKey(x: number, y: number) { return `${x},${y}` }
export function parseKey(k: string) { const [x, y] = k.split(',').map(Number); return { x, y } }
export function isRoadAt(roads: { x: number; y: number }[], x: number, y: number) {
  return roads.some(r => r.x === x && r.y === y)
}
export function getBridgeSpan(roads: { x: number; y: number }[], x: number, y: number): number {
  const visited = new Set<string>()
  const q: { x: number; y: number }[] = []
  for (const d of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
    const nx = x + d.x, ny = y + d.y, key = `${nx},${ny}`
    if (isRiverAt(nx, ny) && isRoadAt(roads, nx, ny) && !visited.has(key)) { visited.add(key); q.push({ x: nx, y: ny }) }
  }
  let count = 0
  while (q.length) {
    const cur = q.shift()!; count++
    for (const d of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      const nx = cur.x + d.x, ny = cur.y + d.y, key = `${nx},${ny}`
      if (isRiverAt(nx, ny) && isRoadAt(roads, nx, ny) && !visited.has(key)) { visited.add(key); q.push({ x: nx, y: ny }) }
    }
  }
  return count + 1
}
export function isBuildingAt(bs: Building[], x: number, y: number) {
  return bs.find(b => {
    const bw = b.w ?? 1, bh = b.h ?? 1
    return x >= b.x && x < b.x + bw && y >= b.y && y < b.y + bh
  })
}
export function farmZoneAt(zones: FarmZone[], x: number, y: number) {
  return zones.find(z => x >= z.x && x <= z.x + 1 && y >= z.y && y <= z.y + 1)
}
export function tileInFarmZone(zones: FarmZone[], x: number, y: number) { return Boolean(farmZoneAt(zones, x, y)) }
export function adjacentHasRoad(roads: { x: number; y: number }[], x: number, y: number) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(d => isRoadAt(roads, x + d[0], y + d[1]))
}

/**
 * Returns true when ANY tile in a building's footprint has an adjacent road.
 * Use this instead of bare adjacentHasRoad(…, b.x, b.y) for buildings that
 * may be larger than 1×1 (market, granary are both 2×2).
 */
export function buildingHasRoadAccess(
  roads: { x: number; y: number }[],
  b: { type: BuildingType; x: number; y: number },
): boolean {
  const { w, h } = getBuildingSize(b.type)
  for (let dx = 0; dx < w; dx++)
    for (let dy = 0; dy < h; dy++)
      if (adjacentHasRoad(roads, b.x + dx, b.y + dy)) return true
  return false
}
export function roadsAdjacent(roads: { x: number; y: number }[], bx: number, by: number) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(d => ({ x: bx + d[0], y: by + d[1] })).filter(c => isRoadAt(roads, c.x, c.y))
}
export function findRoadPath(roads: { x: number; y: number }[], start: { x: number; y: number }, end: { x: number; y: number }) {
  const set = new Set(roads.map(r => roadKey(r.x, r.y)))
  const sk = roadKey(start.x, start.y), ek = roadKey(end.x, end.y)
  if (!set.has(sk) || !set.has(ek)) return null
  const q = [sk], parent = new Map<string, string | null>()
  parent.set(sk, null)
  while (q.length) {
    const cur = q.shift()!; if (cur === ek) break
    const { x, y } = parseKey(cur)
    for (const d of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      const nk = roadKey(x + d.x, y + d.y)
      if (!set.has(nk) || parent.has(nk)) continue
      parent.set(nk, cur); q.push(nk)
    }
  }
  if (!parent.has(ek)) return null
  const path: { x: number; y: number }[] = []
  let cur: string | null = ek
  while (cur) { path.push(parseKey(cur)); cur = parent.get(cur) ?? null }
  return path.reverse()
}
export function bestPath(roads: { x: number; y: number }[], from: Building, to: Building) {
  let best: { x: number; y: number }[] | null = null
  for (const fr of roadsAdjacent(roads, from.x, from.y))
    for (const tr of roadsAdjacent(roads, to.x, to.y)) {
      const p = findRoadPath(roads, fr, tr)
      if (p && (!best || p.length < best.length)) best = p
    }
  return best
}
export function buildOxCartRoute(
  granary: Building, pile: { x: number; y: number }, roads: { x: number; y: number }[]
): { route: { x: number; y: number }[]; pileWaypointIndex: number } | null {
  const granaryRoads = roadsAdjacent(roads, granary.x, granary.y)
  if (!granaryRoads.length) return null
  const pileRoads: { x: number; y: number }[] = []
  for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) {
    const tx = pile.x + dx, ty = pile.y + dy
    for (const [ddx, ddy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][])
      if (isRoadAt(roads, tx + ddx, ty + ddy)) pileRoads.push({ x: tx + ddx, y: ty + ddy })
  }
  if (!pileRoads.length) return null
  let bestSeg: { x: number; y: number }[] | null = null
  for (const gr of granaryRoads) for (const pr of pileRoads) {
    const p = findRoadPath(roads, gr, pr)
    if (p && (!bestSeg || p.length < bestSeg.length)) bestSeg = p
  }
  if (!bestSeg) return null
  const toFarm = [{ x: granary.x, y: granary.y }, ...bestSeg, { x: pile.x, y: pile.y }]
  const route = [...toFarm, ...[...toFarm].reverse().slice(1)]
  return { route, pileWaypointIndex: toFarm.length - 1 }
}

// ─── Market helpers ───────────────────────────────────────────────────────
export function getMarketCfg(id: string, cfg: Record<string, MarketConfig>): MarketConfig {
  return cfg[id] ?? DEFAULT_MARKET_CFG
}
export function computeMarketCap(markets: Building[], cfg: Record<string, MarketConfig>): number {
  return markets.reduce((s, m) => s + getMarketCfg(m.id, cfg).shopkeepers * MARKET_CAP_PER_SHOP, 0)
}

// ─── Peddler helpers ──────────────────────────────────────────────────────
export function pickNextPeddlerTile(
  cur: { x: number; y: number }, prev: { x: number; y: number } | null,
  roads: { x: number; y: number }[]
): { x: number; y: number } | null {
  const adj = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
    .map(d => ({ x: cur.x + d.x, y: cur.y + d.y })).filter(t => isRoadAt(roads, t.x, t.y))
  const pool = (prev ? adj.filter(t => !(t.x === prev.x && t.y === prev.y)) : adj)
  const src = pool.length > 0 ? pool : adj
  return src[Math.floor(Math.random() * src.length)] ?? null
}
export function createEmptyPeddlerCargo() { return { crops: createEmptyInventory(), ironTools: 0 } }
export function isPeddlerCargoEmpty(c: { crops: CropInventory; ironTools: number }): boolean {
  return inventoryTotal(c.crops) < 0.1 && c.ironTools === 0
}

// ─── Citizen helpers ──────────────────────────────────────────────────────
export function seededNeeds(seed: number): CitizenNeeds {
  const n = Math.abs(Math.sin(seed))
  return { food: 0.45 + (n % 0.35), safety: 0.5 + ((n * 1.7) % 0.3), culture: 0.4 + ((n * 2.3) % 0.35) }
}
export function createCitizenProfile(seed: number): { name: string; age: number; gender: Gender } {
  const n = Math.abs(Math.sin(seed) * 10_000)
  const gender: Gender = n % 2 > 1 ? 'male' : 'female'
  const surname   = (configData as any).surnames[Math.floor(n) % (configData as any).surnames.length]
  const malePool  = (configData as any).givenNamesMale ?? (configData as any).givenNamsesMale
  const givenPool = gender === 'male' ? malePool : (configData as any).givenNamesFemale
  const given     = givenPool[Math.floor(n * 1.7) % givenPool.length]
  const age       = 16 + (Math.floor(n * 3.1) % 40)
  return { name: `${surname}${given}`, age, gender }
}

// ─── Entry highway ────────────────────────────────────────────────────────
export let ENTRY_TILE: { x: number; y: number } = (() => {
  const edgeX = -Math.floor(MAP_SIZE_X / 2)
  const minY  = -Math.floor(MAP_SIZE_Y / 2)
  const maxY  =  Math.floor(MAP_SIZE_Y / 2) - 1
  const candidates: { x: number; y: number }[] = []
  for (let dx = 0; dx <= 4; dx++) {
    const x = edgeX + dx
    for (let y = minY; y <= maxY; y++) {
      if (!isMountainAt(x, y) && !isRiverAt(x, y)) candidates.push({ x, y })
    }
    if (candidates.length > 0) break
  }
  candidates.sort((a, b) => Math.abs(a.y) - Math.abs(b.y))
  return candidates[0] ?? { x: edgeX, y: 0 }
})()

export let HIGHWAY_MAIN_PATH: { x: number; y: number }[] = []

export function bfsHighwayPath(
  from: { x: number; y: number }, to: { x: number; y: number }
): { x: number; y: number }[] {
  const minX = -Math.floor(MAP_SIZE_X / 2), maxX = Math.floor(MAP_SIZE_X / 2) - 1
  const minY = -Math.floor(MAP_SIZE_Y / 2), maxY = Math.floor(MAP_SIZE_Y / 2) - 1
  const mk  = (x: number, y: number) => `${x},${y}`
  const parent = new Map<string, string | null>()
  parent.set(mk(from.x, from.y), null)
  const queue: { x: number; y: number }[] = [from]
  let found = false
  outer: while (queue.length > 0) {
    const cur = queue.shift()!
    for (const [dx, dy] of [[1, 0], [0, 1], [0, -1], [-1, 0]] as [number, number][]) {
      const nx = cur.x + dx, ny = cur.y + dy
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue
      const k = mk(nx, ny); if (parent.has(k)) continue
      const allowMtnRoad = Boolean(worldGenConfig.road?.allowOnMountains)
      if (isMountainAt(nx, ny) && !allowMtnRoad) continue
      parent.set(k, mk(cur.x, cur.y))
      if (nx === to.x && ny === to.y) { found = true; break outer }
      queue.push({ x: nx, y: ny })
    }
  }
  if (!found) {
    const path: { x: number; y: number }[] = []
    const stepX = from.x <= to.x ? 1 : -1
    for (let x = from.x; x !== to.x + stepX; x += stepX) path.push({ x, y: from.y })
    const stepY = from.y <= to.y ? 1 : -1
    for (let y = from.y + stepY; y !== to.y + stepY; y += stepY) path.push({ x: to.x, y })
    return path
  }
  const path: { x: number; y: number }[] = []
  let cur: string | null = mk(to.x, to.y)
  while (cur !== null) { const [x, y] = cur.split(',').map(Number); path.unshift({ x, y }); cur = parent.get(cur) ?? null }
  return path
}

export function createHighwayRoads(): { x: number; y: number }[] {
  const r: { x: number; y: number }[] = []
  const seen = new Set<string>()
  const add = (x: number, y: number) => { const k = `${x},${y}`; if (!seen.has(k)) { seen.add(k); r.push({ x, y }) } }
  const minX = -Math.floor(MAP_SIZE_X / 2), maxX = Math.floor(MAP_SIZE_X / 2) - 1
  const minY = -Math.floor(MAP_SIZE_Y / 2), maxY = Math.floor(MAP_SIZE_Y / 2) - 1
  const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]

  // Find nearest clear (non-river, non-mountain) tile to city center to use as BFS goal.
  // Avoids the bug where (0,0) is a river tile and the BFS never reaches it.
  const clearGoal: { x: number; y: number } = (() => {
    for (let radius = 0; radius <= 20; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
          if (!isMountainAt(dx, dy) && !isRiverAt(dx, dy)) return { x: dx, y: dy }
        }
      }
    }
    return { x: 0, y: 0 }
  })()

  function inBounds(x: number, y: number) { return x >= minX && x <= maxX && y >= minY && y <= maxY }
  function bfsPath(start: { x: number; y: number }, goal: { x: number; y: number }): { x: number; y: number }[] | null {
    const q = [start], parent = new Map<string, string | null>()
    parent.set(`${start.x},${start.y}`, null)
    while (q.length > 0) {
      const p = q.shift()!; if (p.x === goal.x && p.y === goal.y) break
      for (const [dx, dy] of DIR4) {
        const nx = p.x + dx, ny = p.y + dy; if (!inBounds(nx, ny)) continue
        const k = `${nx},${ny}`; if (parent.has(k)) continue
        if (isMountainAt(nx, ny) || isRiverAt(nx, ny)) continue
        parent.set(k, `${p.x},${p.y}`); q.push({ x: nx, y: ny })
      }
    }
    const gk = `${goal.x},${goal.y}`; if (!parent.has(gk)) return null
    const rev: { x: number; y: number }[] = []; let cur: string | null = gk
    while (cur) { const [sx, sy] = cur.split(',').map(Number); rev.push({ x: sx, y: sy }); cur = parent.get(cur) ?? null }
    return rev.reverse()
  }

  for (let dx = 0; dx < 8; dx++) {
    const x = minX + dx
    const candidates = Array.from({ length: maxY - minY + 1 }, (_, i) => ({ x, y: minY + i }))
      .filter(p => !isMountainAt(p.x, p.y) && !isRiverAt(p.x, p.y))
      .sort((a, b) => Math.abs(a.y) - Math.abs(b.y))
    if (!candidates.length) continue
    for (const s of candidates) {
      const path = bfsPath(s, clearGoal)
      if (path?.length) {
        HIGHWAY_MAIN_PATH = path.slice()
        ENTRY_TILE = HIGHWAY_MAIN_PATH[0]
        try { if (typeof window !== 'undefined') { (window as any).HIGHWAY_MAIN_PATH = HIGHWAY_MAIN_PATH; (window as any).ENTRY_TILE = ENTRY_TILE; (window as any).__ENTRY_TILE__ = ENTRY_TILE } } catch { /* ignore */ }
        for (const pt of path) add(pt.x, pt.y)
        for (let cx = 0; cx <= 5; cx++) add(cx, 0)
        add(1, 1); add(3, 1)
        return r
      }
    }
  }

  // Fallback: find nearest clear tile from leftmost column
  for (let y = minY; y <= maxY; y++) {
    const q: { x: number; y: number }[] = [{ x: minX, y }]
    const fParent = new Map<string, string | null>()
    fParent.set(`${minX},${y}`, null)
    let foundStart: { x: number; y: number } | null = null
    while (q.length > 0 && !foundStart) {
      const p = q.shift()!
      for (const [dx, dy] of DIR4) {
        const nx = p.x + dx, ny = p.y + dy; if (!inBounds(nx, ny)) continue
        const k = `${nx},${ny}`; if (fParent.has(k)) continue
        if (!isMountainAt(nx, ny) && !isRiverAt(nx, ny)) { foundStart = { x: nx, y: ny }; break }
        fParent.set(k, `${p.x},${p.y}`); q.push({ x: nx, y: ny })
      }
    }
    if (foundStart) {
      const path = bfsPath(foundStart, clearGoal)
      if (path?.length) {
        HIGHWAY_MAIN_PATH = path.slice(); ENTRY_TILE = HIGHWAY_MAIN_PATH[0]
        try { if (typeof window !== 'undefined') { (window as any).ENTRY_TILE = ENTRY_TILE; (window as any).__ENTRY_TILE__ = ENTRY_TILE } } catch { /* ignore */ }
        for (const pt of path) add(pt.x, pt.y)
        for (let cx = 0; cx <= 5; cx++) add(cx, 0)
        add(1, 1); add(3, 1)
        return r
      }
    }
  }

  // Final fallback
  for (let dx = 0; dx < 6; dx++) {
    for (let y = minY; y <= maxY; y++) {
      const x = minX + dx
      if (!isMountainAt(x, y) && !isRiverAt(x, y)) {
        add(x, y); HIGHWAY_MAIN_PATH = [{ x, y }]; ENTRY_TILE = { x, y }
        try { if (typeof window !== 'undefined') { (window as any).ENTRY_TILE = ENTRY_TILE; (window as any).__ENTRY_TILE__ = ENTRY_TILE } } catch { /* ignore */ }
        return r
      }
    }
  }
  return r
}

// ─── Logical positions (interpolated for rendering) ───────────────────────
export function logicalMigrantPos(m: Migrant) {
  const a = m.route[m.routeIndex] ?? m.route[m.route.length - 1] ?? { x: 0, y: 0 }
  const b = m.route[m.routeIndex + 1] ?? a
  return { x: a.x + (b.x - a.x) * m.routeT, y: a.y + (b.y - a.y) * m.routeT }
}
export function logicalWalkerPos(w: Walker) {
  const a = w.route[w.routeIndex] ?? w.route[w.route.length - 1] ?? { x: 0, y: 0 }
  const b = w.route[w.routeIndex + 1] ?? a
  return { x: a.x + (b.x - a.x) * w.routeT, y: a.y + (b.y - a.y) * w.routeT }
}
export function logicalOxCartPos(c: OxCart) {
  const a = c.route[c.routeIndex] ?? c.route[c.route.length - 1] ?? { x: 0, y: 0 }
  const b = c.route[c.routeIndex + 1] ?? a
  return { x: a.x + (b.x - a.x) * c.routeT, y: a.y + (b.y - a.y) * c.routeT }
}
export function logicalMarketBuyerPos(mb: MarketBuyer) {
  const a = mb.route[mb.routeIndex] ?? mb.route[mb.route.length - 1] ?? { x: 0, y: 0 }
  const b = mb.route[mb.routeIndex + 1] ?? a
  return { x: a.x + (b.x - a.x) * mb.routeT, y: a.y + (b.y - a.y) * mb.routeT }
}
export function logicalPeddlerPos(p: Peddler) {
  return {
    x: p.fromTile.x + (p.toTile.x - p.fromTile.x) * p.segT,
    y: p.fromTile.y + (p.toTile.y - p.fromTile.y) * p.segT,
  }
}

