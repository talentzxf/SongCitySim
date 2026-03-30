import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  DAY_TICKS, EVENING_START, MARKET_BUYER_SPEED, MIGRANT_TILES_PER_SECOND,
  MONTH_TICKS, MORNING_START, OX_CART_SPEED, SIM_TICK_MS, SHOP_INTERVAL_DAYS, WALKER_SPEED,
} from '../config/simulation'
import configData from '../config/buildings-and-citizens.json'

// ─── Building types (宋朝) ─────────────────────────────────────────────────
export type BuildingType =
  | 'house'        // 民居
  | 'market'       // 集市
  | 'granary'      // 粮仓
  | 'blacksmith'   // 铁匠铺
  | 'mine'         // 矿山

export const ALL_BUILDING_TYPES: BuildingType[] = [
  'house', 'market', 'granary', 'blacksmith', 'mine',
]

export type Profession =
  | 'merchant' | 'smith' | 'miner' | 'storekeeper' | 'farmer'

export type CropType = 'rice' | 'millet' | 'wheat' | 'soybean' | 'vegetable'
export type CropInventory = Record<CropType, number>

export type FarmZone = {
  id: string; x: number; y: number
  cropType: CropType           // 当前周期正在生长的作物
  pendingCropType?: CropType   // 下一周期切换的作物（undefined = 无待切换）
  growthProgress: number
}
export type RiverTile = { x: number; y: number }

// ── 物流链实体 ─────────────────────────────────────────────────────────────
/** 田间收获堆（等待牛车来取） */
export type FarmPile = {
  id: string; zoneId: string
  x: number; y: number           // 农田锚点位置
  cropType: CropType; amount: number
  age: number                    // ticks since created（超时自动入库）
}
/** 粮仓牛车：粮仓 → 农田堆 → 粮仓（走道路，白天有仓丁才出发） */
export type OxCart = {
  id: string; pileId: string; granaryId: string
  route: { x: number; y: number }[]
  routeIndex: number; routeT: number; speed: number
  pickedUp: boolean
  cargoType: CropType; cargoAmount: number
  pileWaypointIndex: number   // route[] 中农田拾取点的下标
}
/** 集市行商：集市 → 粮仓 → 集市（3 waypoint，批发） */
export type MarketBuyer = {
  id: string; marketId: string; granaryId: string
  route: { x: number; y: number }[]
  routeIndex: number; routeT: number; speed: number
  pickedUp: boolean
  cargoType: CropType; cargoAmount: number
}

export type Gender = 'male' | 'female'

export type Building = {
  id: string
  type: BuildingType
  x: number; y: number
  capacity: number
  occupants: number
  workerSlots: number
  cost: number
}

export type CitizenNeeds = { food: number; safety: number; culture: number }

export type Citizen = {
  id: string
  name: string
  age: number
  gender: Gender
  houseId: string
  workplaceId: string | null
  farmZoneId: string | null    // 分配的农田ID（无建筑工作时使用）
  profession: Profession | null
  satisfaction: number
  needs: CitizenNeeds
  isAtHome: boolean
  isSick: boolean
  sickTicks: number    // 连续患病帧数，超过阈值则死亡
}

export type Migrant = {
  id: string
  targetHouseId: string
  route: { x: number; y: number }[]
  routeIndex: number; routeT: number; speed: number
}

export type Walker = {
  id: string
  citizenId: string
  route: { x: number; y: number }[]
  routeIndex: number; routeT: number; speed: number
  purpose: 'toWork' | 'toHome' | 'toShop' | 'fromShop'
  targetId?: string        // marketId for shopping walkers
  cargo?: CropInventory    // 购物后随身携带的货物，抵家才入库
}

// ─── 行商货物（可扩展：将来加布匹、药材等字段即可） ─────────────────────
export type PeddlerCargo = {
  crops: CropInventory   // 粮食（按品类）
  ironTools: number      // 铁制农具（件）
  // future: medicine: number; cloth: number; …
}
export type MarketConfig = { shopkeepers: number; peddlers: number }
export type Peddler = {
  id: string; marketId: string
  cargo: PeddlerCargo
  phase: 'outbound' | 'returning'
  stepsLeft: number
  fromTile: { x: number; y: number }
  toTile:   { x: number; y: number }
  segT: number; speed: number
  prevTile: { x: number; y: number } | null
  returnRoute: { x: number; y: number }[]
  returnIdx: number
}

export type Tool = 'pan' | 'road' | 'bulldoze' | 'farmZone' | BuildingType

export type LastAction =
  | { kind: 'placeBuilding'; id: string; cost: number }
  | { kind: 'placeRoad'; x: number; y: number }
  | { kind: 'removeBuilding'; building: Building }
  | { kind: 'removeRoad'; x: number; y: number }

export type BuildAttempt = {
  success: boolean; reason: string
  buildType: BuildingType | null; x: number; y: number; ts: number
}

export type CityState = {
  money: number; population: number; tick: number; running: boolean
  buildings: Building[]
  roads: { x: number; y: number }[]
  farmZones: FarmZone[]
  selectedBuildingType: BuildingType | null
  selectedTool: Tool
  selectedBuildingId: string | null
  selectedCitizenId: string | null
  selectedFarmZoneId: string | null
  lastAction: LastAction | null
  lastBuildAttempt: BuildAttempt | null
  citizens: Citizen[]
  houseFood: Record<string, number>
  houseCrops: Record<string, CropInventory>      // 各类粮食存量（per house）
  houseSavings: Record<string, number>           // 积蓄（铜钱）
  taxRates: { ding: number; tian: number; shang: number }  // 丁税/田赋/市税率
  monthlyFarmOutput: number   // 本月累计田产（担）
  monthlyFarmValue: number    // 本月累计田产货值（文）
  monthlyMarketSales: number  // 本月累计市销额（文）
  lastMonthlyFarmValue: number     // 上月田产货值（用于田赋估算）
  lastMonthlyMarketSales: number   // 上月市销额（用于市税估算）
  lastTaxBreakdown: { ding: number; tian: number; shang: number }  // 上月税收明细
  lastMonthlyExpenseBreakdown: { yangmin: number; jianshe: number; total: number }  // 上月支出明细
  monthlyConstructionCost: number   // 本月累计兴工建造支出（建筑+桥梁）
  mineInventory: number             // 全城铁矿石存量（担）
  smithInventory: number            // 全城铁制农具存量（件）
  houseTools: Record<string, number> // 各户持有铁制农具数量（件）
  farmInventory: CropInventory
  granaryInventory: CropInventory
  marketInventory: CropInventory
  migrants: Migrant[]
  walkers: Walker[]
  peddlers: Peddler[]
  farmPiles: FarmPile[]
  oxCarts: OxCart[]
  marketBuyers: MarketBuyer[]
  marketConfig: Record<string, MarketConfig>   // 各集市坐贾/行商配置
  month: number
  dayTime: number    // 0–1: 0=midnight,0.25=6am,0.5=noon,0.75=6pm
  dayCount: number
  lastMonthlyTax: number
  lastHouseholdBuyDay: number
  avgSatisfaction: number
  needPressure: CitizenNeeds
  houseDead: Record<string, number>   // 各房屋未清理的亡者数量（疫病传播源）
}

// ─── Building definitions ─────────────────────────────────────────────────

type BuildingDef = { cost: number; capacity: number; workerSlots: number; needBonus: Partial<CitizenNeeds> }

const BUILDING_DEFS: Record<BuildingType, BuildingDef> = Object.entries(configData.buildings).reduce((acc, [key, cfg]: [string, any]) => {
  acc[key as BuildingType] = { cost: cfg.cost, capacity: cfg.capacity, workerSlots: cfg.workerSlots, needBonus: cfg.needBonus }
  return acc
}, {} as Record<BuildingType, BuildingDef>)

// Exported for ghost preview cost checks
export const BUILDING_COST: Record<BuildingType, number> = Object.entries(BUILDING_DEFS).reduce(
  (acc, [k, v]) => { acc[k as BuildingType] = v.cost; return acc },
  {} as Record<BuildingType, number>
)

const PROFESSION_BY_BUILDING: Partial<Record<BuildingType, Profession>> = Object.entries(configData.professions).reduce((acc, [prof, profCfg]: [string, any]) => {
  for (const bType of profCfg.buildingTypes) {
    acc[bType as BuildingType] = prof as Profession
  }
  return acc
}, {} as Partial<Record<BuildingType, Profession>>)

const CROP_KEYS = Object.keys(configData.crops) as CropType[]

const MAP_SIZE_X = 80
const MAP_SIZE_Y = 60

function createRng(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

// ─── 2-D Perlin (gradient) noise ─────────────────────────────────────────
function buildPermTable(seed: number): Uint8Array {
  const rand = createRng(seed)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const tmp = p[i]; p[i] = p[j]; p[j] = tmp }
  return p
}
function perlin2(x: number, y: number, p: Uint8Array): number {
  const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255
  const xf = x - Math.floor(x), yf = y - Math.floor(y)
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const u = fade(xf), v = fade(yf)
  const grad = (h: number, dx: number, dy: number) => { switch (h & 3) { case 0: return dx + dy; case 1: return -dx + dy; case 2: return dx - dy; default: return -dx - dy } }
  const aa = p[(p[xi] + yi) & 255], ab = p[(p[xi] + yi + 1) & 255]
  const ba = p[(p[xi + 1] + yi) & 255], bb = p[(p[xi + 1] + yi + 1) & 255]
  return (1 - v) * ((1 - u) * grad(aa, xf, yf) + u * grad(ba, xf - 1, yf))
       +      v  * ((1 - u) * grad(ab, xf, yf - 1) + u * grad(bb, xf - 1, yf - 1))
}
/** Fractal Brownian Motion: sum of Perlin octaves, result ≈ [0, 1]. */
function fbm(x: number, y: number, p: Uint8Array, oct = 6, lac = 2.0, gain = 0.5): number {
  let v = 0, a = 1.0, f = 1.0, mx = 0
  for (let i = 0; i < oct; i++) { v += perlin2(x * f, y * f, p) * a; mx += a; a *= gain; f *= lac }
  return v / mx + 0.5   // centre around 0.5
}

/**
 * Ridged fBm approximation: take inverted absolute of Perlin to concentrate energy
 * into sharp ridges. Returns value in ~[0,1].
 */
function ridgedFbm(x: number, y: number, p: Uint8Array, oct = 5, lac = 2.0, gain = 0.5): number {
  let v = 0, a = 1.0, f = 1.0, mx = 0
  for (let i = 0; i < oct; i++) {
    const n = perlin2(x * f, y * f, p) // roughly -1..1
    const r = 1 - Math.abs(n)           // ridge response: near 1 where noise crosses zero
    v += r * a
    mx += a
    a *= gain
    f *= lac
  }
  return Math.max(0, Math.min(1, v / mx))
}

// ─── Unified world generation ──────────────────────────────────────────────
// One Perlin fBm heightmap drives everything:
//  1. Dijkstra routes the river through the lowest valley (left→right).
//  2. Valley carving lowers terrain near the river so mountains are visibly uphill.
//  3. Tiles above threshold become mountains; clusters within them become ore veins.
// This guarantees the river always flows through terrain low-points.
const WORLD_SEED = Math.floor(Math.random() * 1_000_000_000)

const {
  riverTiles:      _RIVER_TILES,
  riverCenterLine: _RIVER_CENTER_LINE,
  mountainTiles:   _MOUNTAIN_TILES,
  mountainHeightMap: MOUNTAIN_HEIGHT_MAP,
  oreVeinTiles:    _ORE_VEIN_TILES,
} = (() => {
  const perm    = buildPermTable(WORLD_SEED)
  const oreRand = createRng(WORLD_SEED ^ 0xdeadbeef)

  const W = MAP_SIZE_X, H = MAP_SIZE_Y
  const minX = -Math.floor(W / 2), maxX = Math.floor(W / 2) - 1
  const minY = -Math.floor(H / 2), maxY = Math.floor(H / 2) - 1
  const N = W * H

  // ── 1. Perlin fBm heightmap ──────────────────────────────────────────────
  const hArr = new Float32Array(N)
  const toI   = (x: number, y: number) => (y - minY) * W + (x - minX)
  const atH   = (x: number, y: number) => hArr[toI(x, y)]
  const setH  = (x: number, y: number, v: number) => { hArr[toI(x, y)] = Math.max(0, Math.min(1, v)) }

  for (let ix = minX; ix <= maxX; ix++) {
    for (let iy = minY; iy <= maxY; iy++) {
      // Scale so ~2-3 main mountain ridges span the map (longer wavelengths)
      const fx = (ix - minX) / W * 3.0
      const fy = (iy - minY) / H * 2.5
      // Combine a smooth base + a ridged fBm for pronounced mountain crests
      // Build terrain with layered Perlin/FBM components so mountains appear naturally around the city.
      // 1) large-scale basin/plateau from low-frequency Perlin
      const large = perlin2(fx * 0.18, fy * 0.18, perm) * 0.6 + 0.4 // bias into positive
      // 2) smooth base terrain (fbm)
      const base = fbm(fx * 0.7, fy * 0.7, perm, 5, 2.0, 0.55) * 0.45
      // 3) ridged fBm for sharper crests (mountain peaks)
      const ridge = ridgedFbm(fx * 1.2, fy * 1.2, perm, 6, 2.0, 0.55) * 1.1
      // radial bias: keep central city flat, encourage mountains further from center
      const maxDist = Math.sqrt((maxX - minX) * (maxX - minX) + (maxY - minY) * (maxY - minY)) / 2
      const nd = Math.sqrt(ix * ix + iy * iy) / (maxDist || 1)
      const radial = Math.max(0, Math.min(1, (nd - 0.18) / 0.82)) // 0 near center, 1 near edge
      // combine components; clamp to [0,1]
      let h = clamp01(base * (0.7 - radial * 0.4) + ridge * (0.6 + radial * 0.8) + large * 0.12)

      // Keep the starting city area (around origin) flat
      const d = Math.sqrt(ix * ix + iy * iy)
      if      (d < 12) h *= 0.05
      else if (d < 22) { const t = (d - 12) / 10; h *= t * t * (3 - 2 * t) }
      setH(ix, iy, h)
    }
  }

  // ── 2. River extraction: find a natural left→right valley path using Dijkstra on the heightmap ─
  // Build 8-neighbour offsets
  const DIRS8: [number, number][] = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]

  // Dijkstra from all left-edge cells to any right-edge cell, minimizing sum of elevation (prefers low valleys)
  const dist = new Float32Array(N).fill(Number.POSITIVE_INFINITY)
  const prev = new Int32Array(N).fill(-1)
  const seen = new Uint8Array(N).fill(0)

  // Min-heap implementation
  class Heap {
    data: number[] = []
    push(v: number) { this.data.push(v); this._siftUp(this.data.length - 1) }
    pop(): number | undefined { if (this.data.length === 0) return undefined; const r = this.data[0]; const last = this.data.pop()!; if (this.data.length>0){ this.data[0]=last; this._siftDown(0)}; return r }
    _siftUp(i: number){ while(i>0){ const p=(i-1)>>1; if(this._cmp(this.data[i],this.data[p])<0){[this.data[i],this.data[p]]=[this.data[p],this.data[i]]; i=p}else break} }
    _siftDown(i:number){ const n=this.data.length; while(true){ let l= i*2+1; if(l>=n) break; let r=l+1; let min=l; if(r<n && this._cmp(this.data[r],this.data[l])<0) min=r; if(this._cmp(this.data[min],this.data[i])<0){ [this.data[min],this.data[i]]=[this.data[i],this.data[min]]; i=min } else break } }
    _cmp(a:number,b:number){ return (dist[a] ?? Infinity) - (dist[b] ?? Infinity) }
  }

  // We'll store heap items as packed (distIndex = distVal * 1e6 + index) to avoid separate tuple storage
  const heap = new Heap()
  // initialize left-edge sources
  for (let y = minY; y <= maxY; y++) {
    const i = toI(minX, y)
    const h = Math.max(0, atH(minX, y))
    dist[i] = h
    heap.push(i)
  }

  let targetIndex = -1
  while (true) {
    const cur = heap.pop()
    if (cur === undefined) break
    const u = cur
    if (seen[u]) continue
    seen[u] = 1
    const ux = (u % W) + minX, uy = Math.floor(u / W) + minY
    if (ux === maxX) { targetIndex = u; break }
    for (const [dx, dy] of DIRS8) {
      const nx = ux + dx, ny = uy + dy
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue
      const vIdx = toI(nx, ny)
      if (seen[vIdx]) continue
      // weight = neighbor elevation + small movement cost
      const w = Math.max(0, atH(nx, ny)) + 0.01
      const nd = dist[u] + w
      if (nd < dist[vIdx]) { dist[vIdx] = nd; prev[vIdx] = u; heap.push(vIdx) }
    }
  }

  const riverSet = new Set<string>()
  const riverTiles: RiverTile[] = []
  if (targetIndex >= 0) {
    // reconstruct path
    let cur = targetIndex
    const rev: { x: number; y: number }[] = []
    while (cur >= 0) {
      const x = (cur % W) + minX, y = Math.floor(cur / W) + minY
      rev.push({ x, y })
      if (prev[cur] === -1) break
      cur = prev[cur]
    }
    rev.reverse()
    // ensure monotonic left→right per column: average y per x and smooth
    const perX = new Map<number, number[]>()
    for (const p of rev) { if (!perX.has(p.x)) perX.set(p.x, []); perX.get(p.x)!.push(p.y) }
    const xs = Array.from(perX.keys()).sort((a,b)=>a-b)
    const pts = xs.map(x => { const ys = perX.get(x)!; const avg = ys.reduce((s,v)=>s+v,0)/ys.length; return { x, y: avg } })
    // moving average smoothing
    const smoothed = pts.map((pt,i)=>{ const y0=pts[i-1]?.y??pt.y; const y1=pt.y; const y2=pts[i+1]?.y??pt.y; return { x: pt.x, y: (y0*0.25+y1*0.5+y2*0.25) } })
    for (const p of smoothed) { const iy = Math.round(p.y); riverTiles.push({ x: p.x, y: iy }); riverSet.add(`${p.x},${iy}`) }
  }

  // Fallback: if no path found or river too short, fallback to per-column max-elevation accumulation (robust)
  const riverMapWidth = maxX - minX + 1
  if (riverTiles.length < Math.max(6, Math.floor(riverMapWidth * 0.3))) {
    riverTiles.length = 0; riverSet.clear()
    for (let ix = minX; ix <= maxX; ix++) {
      let bestY = minY, bestVal = Infinity
      for (let iy = minY; iy <= maxY; iy++) {
        const v = atH(ix, iy)
        if (v < bestVal) { bestVal = v; bestY = iy }
      }
      riverTiles.push({ x: ix, y: bestY }); riverSet.add(`${ix},${bestY}`)
    }
  }

  // Widen river one tile to river-side (prefer downhill side) and carve valley
  const CARVE_R = 6, CARVE_D = 0.36
  const addR = (x: number, y: number) => { if (x < minX || x > maxX || y < minY || y > maxY) return; const k = `${x},${y}`; if (!riverSet.has(k)) { riverSet.add(k); riverTiles.push({ x, y }) } }
  for (const rt of [...riverTiles]) {
    const x = rt.x, y = rt.y
    let bestN = null as null | { x: number; y: number; h: number }
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
      const nx = x + dx, ny = y + dy
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue
      const h = atH(nx, ny)
      if (!bestN || h < bestN.h) bestN = { x: nx, y: ny, h }
    }
    if (bestN) addR(bestN.x, bestN.y)
  }

  // Carve valley: lower terrain near river so surrounding slopes visibly lead to it
  for (const s of riverSet) {
    const [rx, ry] = s.split(',').map(Number)
    for (let dx = -CARVE_R; dx <= CARVE_R; dx++) for (let dy = -CARVE_R; dy <= CARVE_R; dy++) {
      const d = Math.sqrt(dx * dx + dy * dy); if (d > CARVE_R) continue
      const x = rx + dx, y = ry + dy
      if (x < minX || x > maxX || y < minY || y > maxY) continue
      const f = 1 - d / CARVE_R
      setH(x, y, riverSet.has(`${x},${y}`) ? 0 : atH(x, y) - CARVE_D * f * f)
    }
  }

  // ── 4. Classify mountains from the carved heightmap ──────────────────────
  const MTHRESH = 0.60
  const mountainTiles:    { x: number; y: number }[] = []
  const mountainHeightMap = new Map<string, number>()
  for (let ix = minX; ix <= maxX; ix++) for (let iy = minY; iy <= maxY; iy++) {
    if (riverSet.has(`${ix},${iy}`)) continue
    const h = atH(ix, iy)
    if (h >= MTHRESH) { mountainTiles.push({ x: ix, y: iy }); mountainHeightMap.set(`${ix},${iy}`, (h - MTHRESH) / (1 - MTHRESH)) }
  }

  // ── 5. River centre-line: one midpoint per x-column, sorted left→right ──
  const colMap = new Map<number, number[]>()
  for (const t of riverTiles) { if (!colMap.has(t.x)) colMap.set(t.x, []); colMap.get(t.x)!.push(t.y) }
  // Build centre-line by picking, per column, the river tile with highest flow accumulation.
  // This follows the main channel instead of taking a midpoint which can jump across branches.
  // Pick for each column the river tile with lowest elevation (prefer valley within column)
  let riverCenterLine = Array.from(colMap.keys()).sort((a, b) => a - b).map(x => {
    const ys = colMap.get(x)!
    let bestY = ys[0]
    let bestH = atH(x, bestY)
    for (const y of ys) {
      const hval = atH(x, y)
      if (hval < bestH) { bestH = hval; bestY = y }
    }
    return { x, y: bestY }
  })
  // Ensure centre-line covers a reasonable horizontal span; if it's too short, fallback to per-column lowest-y
  const centerMapWidth = maxX - minX + 1
  const MIN_WIDTH_FRACTION = 0.5
  const minAcceptLen = Math.max( Math.floor(centerMapWidth * MIN_WIDTH_FRACTION), 6 )
  if (riverCenterLine.length < minAcceptLen) {
    const fallback: { x: number; y: number }[] = []
    for (let ix = minX; ix <= maxX; ix++) {
      let bestY = minY, bestVal = Infinity
      for (let iy = minY; iy <= maxY; iy++) {
        const hval = atH(ix, iy)
        if (hval < bestVal) { bestVal = hval; bestY = iy }
      }
      fallback.push({ x: ix, y: bestY })
    }
    riverCenterLine = fallback
  }

  // ── 6. Ore vein clusters within mountain tiles ────────────────────────────
  const mKeys  = new Set(mountainTiles.map(t => `${t.x},${t.y}`))
  const oreSet = new Set<string>()
  const NUM_VEINS = 7, VEIN_R = 4
  for (let v = 0; v < NUM_VEINS && mountainTiles.length > 0; v++) {
    const c = mountainTiles[Math.floor(oreRand() * mountainTiles.length)]
    for (let dx = -VEIN_R; dx <= VEIN_R; dx++) for (let dy = -VEIN_R; dy <= VEIN_R; dy++) {
      if (dx * dx + dy * dy > VEIN_R * VEIN_R * 1.1 || oreRand() > 0.60) continue
      const k = `${c.x + dx},${c.y + dy}`; if (mKeys.has(k)) oreSet.add(k)
    }
  }
  const oreVeinTiles = Array.from(oreSet).map(k => { const [x, y] = k.split(',').map(Number); return { x, y } })

  return { riverTiles, riverCenterLine, mountainTiles, mountainHeightMap, oreVeinTiles }
})()

// ─── Exports from unified world generation ────────────────────────────────
export const RIVER_TILES: RiverTile[]           = _RIVER_TILES
export const RIVER_CENTER_LINE: { x: number; y: number }[] = _RIVER_CENTER_LINE
export const MOUNTAIN_TILES: { x: number; y: number }[]    = _MOUNTAIN_TILES
export const ORE_VEIN_TILES: { x: number; y: number }[]   = _ORE_VEIN_TILES

const RIVER_TILE_KEYS    = new Set(RIVER_TILES.map(t => `${t.x},${t.y}`))
const MOUNTAIN_TILE_KEYS = new Set(MOUNTAIN_TILES.map(t => `${t.x},${t.y}`))
const ORE_VEIN_TILE_KEYS = new Set(ORE_VEIN_TILES.map(t => `${t.x},${t.y}`))

export function isRiverAt(x: number, y: number): boolean   { return RIVER_TILE_KEYS.has(`${x},${y}`) }
export function isMountainAt(x: number, y: number): boolean { return MOUNTAIN_TILE_KEYS.has(`${x},${y}`) }
export function isOreVeinAt(x: number, y: number): boolean  { return ORE_VEIN_TILE_KEYS.has(`${x},${y}`) }
/** Normalised [0,1] height for mountain tiles (0 = just above threshold, 1 = peak). */
export function getMountainHeight(x: number, y: number): number { return MOUNTAIN_HEIGHT_MAP.get(`${x},${y}`) ?? 0 }

// ─── Within-5-tiles-of-river set (Chebyshev distance ≤ 5) ────────────────
const NEAR_RIVER_FIVE_KEYS = (() => {
  const set = new Set<string>()
  for (const rt of RIVER_TILES) {
    for (let dx = -5; dx <= 5; dx++)
      for (let dy = -5; dy <= 5; dy++)
        set.add(`${rt.x + dx},${rt.y + dy}`)
  }
  return set
})()
export function isNearRiverFive(x: number, y: number): boolean {
  return NEAR_RIVER_FIVE_KEYS.has(`${x},${y}`) && !isRiverAt(x, y)
}

// ─── Entry highway: BFS from map edge → city, avoiding mountains ──────────
/**
 * BFS on the tile grid from `from` to `to`, skipping mountain tiles.
 * River tiles are allowed (they are bridgeable).
 * Returns the path as an array of tiles, or a straight-line fallback.
 */
function bfsHighwayPath(
  from: { x: number; y: number },
  to:   { x: number; y: number }
): { x: number; y: number }[] {
  const minX = -Math.floor(MAP_SIZE_X / 2)
  const maxX =  Math.floor(MAP_SIZE_X / 2) - 1
  const minY = -Math.floor(MAP_SIZE_Y / 2)
  const maxY =  Math.floor(MAP_SIZE_Y / 2) - 1
  const mk = (x: number, y: number) => `${x},${y}`
  const parent = new Map<string, string | null>()
  parent.set(mk(from.x, from.y), null)
  const queue: { x: number; y: number }[] = [from]
  let found = false
  outer: while (queue.length > 0) {
    const cur = queue.shift()!
    for (const [dx, dy] of [[1,0],[0,1],[0,-1],[-1,0]] as [number,number][]) {
      const nx = cur.x + dx, ny = cur.y + dy
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue
      const k = mk(nx, ny)
      if (parent.has(k)) continue
      if (isMountainAt(nx, ny)) continue   // 绕过山地
      parent.set(k, mk(cur.x, cur.y))
      if (nx === to.x && ny === to.y) { found = true; break outer }
      queue.push({ x: nx, y: ny })
    }
  }
  if (!found) {
    // Fallback: horizontal then vertical straight line
    const path: { x: number; y: number }[] = []
    const stepX = from.x <= to.x ? 1 : -1
    for (let x = from.x; x !== to.x + stepX; x += stepX) path.push({ x, y: from.y })
    const stepY = from.y <= to.y ? 1 : -1
    for (let y = from.y + stepY; y !== to.y + stepY; y += stepY) path.push({ x: to.x, y })
    return path
  }
  // Trace back
  const path: { x: number; y: number }[] = []
  let cur: string | null = mk(to.x, to.y)
  while (cur !== null) {
    const [x, y] = cur.split(',').map(Number)
    path.unshift({ x, y })
    cur = parent.get(cur) ?? null
  }
  return path
}

/**
 * The tile where migrants enter the map: left-edge tile, not a mountain,
 * closest to y = 0.  Exported so the HUD / spawn logic can reference it.
 */
export const ENTRY_TILE: { x: number; y: number } = (() => {
  const edgeX = -Math.floor(MAP_SIZE_X / 2)          // = -40 (left boundary)
  const minY  = -Math.floor(MAP_SIZE_Y / 2)           // = -30
  const maxY  =  Math.floor(MAP_SIZE_Y / 2) - 1       // = 29
  const candidates: { x: number; y: number }[] = []
  // Scan a few columns from the left so we always find at least one open tile
  for (let dx = 0; dx <= 4; dx++) {
    const x = edgeX + dx
    for (let y = minY; y <= maxY; y++) {
      if (!isMountainAt(x, y) && !isRiverAt(x, y)) candidates.push({ x, y })
    }
    if (candidates.length > 0) break  // Found tiles in this column — stop here
  }
  // Prefer the tile closest to the centre row (y = 0)
  candidates.sort((a, b) => Math.abs(a.y) - Math.abs(b.y))
  return candidates[0] ?? { x: edgeX, y: 0 }
})()

const ECONOMY = {
  arableThreshold: configData.economy?.arableThreshold ?? 0.58,
  farmProductionPerTick: configData.economy?.farmProductionPerTick ?? 0.018,
  farmToGranaryRatePerTick: configData.economy?.farmToGranaryRatePerTick ?? 0.22,
  granaryToMarketRatePerTick: configData.economy?.granaryToMarketRatePerTick ?? 0.18,
  householdBuyTime: configData.economy?.householdBuyTime ?? 0.79,
  householdDailyBuyBase: configData.economy?.householdDailyBuyBase ?? 0.45,
  householdDailyBuyPerResident: configData.economy?.householdDailyBuyPerResident ?? 0.34,
}
const BRIDGE_BASE_COST      = 80    // 桥梁造价 × 跨度格数
export const GRANARY_CAPACITY_PER  = 200   // 每座粮仓最大存粮（担）
const MARKET_CAPACITY_PER          = 100   // 旧值，仅向后兼容
export const MARKET_TOTAL_SLOTS    = 6     // 每集市总人力名额（坐贾+行商）
export const MARKET_CAP_PER_SHOP   = 25    // 每名坐贾对应货架容量（担）（4坐贾×25=100担，与旧值一致）
const DEFAULT_MARKET_CFG: MarketConfig = { shopkeepers: 4, peddlers: 2 }
const MINE_CAPACITY_PER     = 60
const SMITH_CAPACITY_PER    = 20
const ORE_PER_MINER_DAY     = 3
const ORE_PER_TOOL          = 2
export const FARM_TOOL_PRICE = 40
export const TOOL_EFFICIENCY_BONUS = 1.5
const PEDDLER_MAX_STEPS    = 30    // 出发最多走多少格后折返
const PEDDLER_SPEED        = 3.5   // 格/秒
const PEDDLER_CARRY_FOOD   = 10    // 每次出行最多携带粮食（担）
const PEDDLER_CARRY_TOOLS  = 2     // 每次出行最多携带铁器（件）
const PEDDLER_SELL_FOOD    = 5     // 每次向一户民居销售上限（担）
const PEDDLER_FOOD_THRESH  = 10    // 民居存粮低于此值时，行商向其售货

// ─── 疫病系统常量 ──────────────────────────────────────────────────────────
const SICK_DEATH_TICKS      = MONTH_TICKS * 3   // 连续患病超过此帧数 → 死亡（约3个月）
const DEAD_SPREAD_THRESHOLD = 2                  // 房屋内亡者≥此数 → 开始向邻近房屋传播疫病
const DEAD_SPREAD_RADIUS    = 2                  // 传播范围：切比雪夫距离（格）
const DEAD_SPREAD_CHANCE    = 0.0006             // 每帧每名受波及居民的感染概率

// ─── Pure helpers ─────────────────────────────────────────────────────────

function clamp01(v: number) { return Math.max(0, Math.min(1, v)) }
function clampFood(v: number) { return Math.max(0, Math.min(30, Math.round(v * 10) / 10)) }
function clampCrop(v: number) { return Math.max(0, Math.round(v * 100) / 100) }
function tileKey(x:number,y:number) { return `${x},${y}` }
function createEmptyInventory(): CropInventory {
  return { rice: 0, millet: 0, wheat: 0, soybean: 0, vegetable: 0 }
}
function inventoryTotal(inv: CropInventory) {
  return CROP_KEYS.reduce((s, k) => s + inv[k], 0)
}
function cropPrice(k: CropType): number { return (configData.crops as any)[k]?.price ?? 4 }
function terrainFertilityAt(x: number, y: number) {
  const wave = (Math.sin(x * 0.19) + Math.cos(y * 0.23) + Math.sin((x + y) * 0.11)) / 3
  return clamp01(0.55 + wave * 0.28)
}
function isNearRiver(x: number, y: number) {
  if (isRiverAt(x, y)) return false
  return isRiverAt(x + 1, y) || isRiverAt(x - 1, y) || isRiverAt(x, y + 1) || isRiverAt(x, y - 1)
}
export function terrainSuitabilityAt(x: number, y: number) {
  return isNearRiver(x, y)
}
function cropForTile(x: number, y: number): CropType {
  if (isNearRiver(x, y)) return 'rice'
  const keys = CROP_KEYS
  const idx = Math.abs(Math.floor((x * 31 + y * 17 + Math.sin(x * 0.3 + y * 0.2) * 1000))) % keys.length
  return keys[idx]
}
function transferInventory(from: CropInventory, to: CropInventory, maxAmount: number) {
  if (maxAmount <= 0) return 0
  const total = inventoryTotal(from)
  if (total <= 0) return 0
  const amount = Math.min(maxAmount, total)
  let moved = 0
  for (const k of CROP_KEYS) {
    const share = from[k] / total
    const take = Math.min(from[k], clampCrop(amount * share))
    from[k] = clampCrop(from[k] - take)
    to[k] = clampCrop(to[k] + take)
    moved += take
  }
  return clampCrop(moved)
}
function consumeInventory(from: CropInventory, maxAmount: number) {
  if (maxAmount <= 0) return 0
  const total = inventoryTotal(from)
  if (total <= 0) return 0
  const amount = Math.min(maxAmount, total)
  let consumed = 0
  for (const k of CROP_KEYS) {
    if (consumed >= amount) break
    const take = Math.min(from[k], amount - consumed)
    from[k] = clampCrop(from[k] - take)
    consumed += take
  }
  return clampCrop(consumed)
}
function distance(a: { x:number;y:number }, b: { x:number;y:number }) {
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2)
}
function roadKey(x:number,y:number) { return `${x},${y}` }
function parseKey(k:string) { const [x,y]=k.split(',').map(Number); return{x,y} }
function isRoadAt(roads:{x:number;y:number}[],x:number,y:number) { return roads.some(r=>r.x===x&&r.y===y) }
// 计算放置桥梁后的连通跨度（BFS 遍历相邻已有桥格，返回新跨度总长）
function getBridgeSpan(roads:{x:number;y:number}[],x:number,y:number):number{
  const visited=new Set<string>()
  const q:{x:number;y:number}[]=[]
  for(const d of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]){
    const nx=x+d.x,ny=y+d.y,key=`${nx},${ny}`
    if(isRiverAt(nx,ny)&&isRoadAt(roads,nx,ny)&&!visited.has(key)){visited.add(key);q.push({x:nx,y:ny})}
  }
  let count=0
  while(q.length){
    const cur=q.shift()!;count++
    for(const d of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]){
      const nx=cur.x+d.x,ny=cur.y+d.y,key=`${nx},${ny}`
      if(isRiverAt(nx,ny)&&isRoadAt(roads,nx,ny)&&!visited.has(key)){visited.add(key);q.push({x:nx,y:ny})}
    }
  }
  return count+1  // +1 为新放置的格子
}
function isBuildingAt(bs:Building[],x:number,y:number) { return bs.find(b=>b.x===x&&b.y===y) }
function farmZoneAt(zones:FarmZone[],x:number,y:number) { return zones.find(z=>x>=z.x&&x<=z.x+1&&y>=z.y&&y<=z.y+1) }
function tileInFarmZone(zones:FarmZone[],x:number,y:number) { return Boolean(farmZoneAt(zones,x,y)) }
function adjacentHasRoad(roads:{x:number;y:number}[],x:number,y:number) {
  return [[1,0],[-1,0],[0,1],[0,-1]].some(d=>isRoadAt(roads,x+d[0],y+d[1]))
}
function roadsAdjacent(roads:{x:number;y:number}[],bx:number,by:number) {
  return [[1,0],[-1,0],[0,1],[0,-1]].map(d=>({x:bx+d[0],y:by+d[1]})).filter(c=>isRoadAt(roads,c.x,c.y))
}
function findRoadPath(roads:{x:number;y:number}[],start:{x:number;y:number},end:{x:number;y:number}) {
  const set=new Set(roads.map(r=>roadKey(r.x,r.y)))
  const sk=roadKey(start.x,start.y), ek=roadKey(end.x,end.y)
  if(!set.has(sk)||!set.has(ek)) return null
  const q=[sk], parent=new Map<string,string|null>()
  parent.set(sk,null)
  while(q.length) {
    const cur=q.shift()!; if(cur===ek) break
    const {x,y}=parseKey(cur)
    for(const d of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]) {
      const nk=roadKey(x+d.x,y+d.y)
      if(!set.has(nk)||parent.has(nk)) continue
      parent.set(nk,cur); q.push(nk)
    }
  }
  if(!parent.has(ek)) return null
  const path:{ x:number;y:number }[]=[]
  let cur:string|null=ek
  while(cur){path.push(parseKey(cur));cur=parent.get(cur)??null}
  return path.reverse()
}
function bestPath(roads:{x:number;y:number}[],from:Building,to:Building) {
  let best:{ x:number;y:number }[]|null=null
  for(const fr of roadsAdjacent(roads,from.x,from.y))
    for(const tr of roadsAdjacent(roads,to.x,to.y)) {
      const p=findRoadPath(roads,fr,tr)
      if(p&&(!best||p.length<best.length)) best=p
    }
  return best
}
// 为牛车规划沿道路行走的往返路线：粮仓→路段→农田堆→路段→粮仓
function buildOxCartRoute(
  granary: Building,
  pile: { x: number; y: number },
  roads: { x: number; y: number }[]
): { route: { x: number; y: number }[]; pileWaypointIndex: number } | null {
  const granaryRoads = roadsAdjacent(roads, granary.x, granary.y)
  if (granaryRoads.length === 0) return null
  // 找农田堆旁边的路格（2×2 范围）
  const pileRoads: { x: number; y: number }[] = []
  for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) {
    const tx = pile.x + dx, ty = pile.y + dy
    for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][])
      if (isRoadAt(roads, tx + ddx, ty + ddy))
        pileRoads.push({ x: tx + ddx, y: ty + ddy })
  }
  if (pileRoads.length === 0) return null
  // 最短路径
  let bestSeg: { x: number; y: number }[] | null = null
  for (const gr of granaryRoads) for (const pr of pileRoads) {
    const p = findRoadPath(roads, gr, pr)
    if (p && (!bestSeg || p.length < bestSeg.length)) bestSeg = p
  }
  if (!bestSeg) return null
  // 完整路线: 粮仓 → 道路段 → 农田堆 → 道路段（反向）→ 粮仓
  const toFarm = [{ x: granary.x, y: granary.y }, ...bestSeg, { x: pile.x, y: pile.y }]
  const route = [...toFarm, ...[...toFarm].reverse().slice(1)]
  return { route, pileWaypointIndex: toFarm.length - 1 }
}
function seededNeeds(seed:number):CitizenNeeds {
  const n=Math.abs(Math.sin(seed))
  return { food:0.45+(n%0.35), safety:0.5+((n*1.7)%0.3), culture:0.4+((n*2.3)%0.35) }
}

function createCitizenProfile(seed: number): { name: string; age: number; gender: Gender } {
  const n = Math.abs(Math.sin(seed) * 10_000)
  const gender: Gender = n % 2 > 1 ? 'male' : 'female'
  const surname = configData.surnames[Math.floor(n) % configData.surnames.length]
  const malePool = (configData as any).givenNamesMale ?? (configData as any).givenNamsesMale
  const givenPool = gender === 'male' ? malePool : configData.givenNamesFemale
  const given = givenPool[Math.floor(n * 1.7) % givenPool.length]
  const age = 16 + (Math.floor(n * 3.1) % 40)
  return { name: `${surname}${given}`, age, gender }
}
function createHighwayRoads() {
  const r: { x: number; y: number }[] = []
  const seen = new Set<string>()
  const add = (x: number, y: number) => {
    const k = `${x},${y}`
    if (!seen.has(k)) { seen.add(k); r.push({ x, y }) }
  }
  // BFS 避山路径：从地图左侧入口 → 城区中心 (0,0)
  const path = bfsHighwayPath(ENTRY_TILE, { x: 0, y: 0 })
  for (const pt of path) add(pt.x, pt.y)
  // 城区内短固定段（原点附近半径<12，地形恒为平地）
  for (let x = 0; x <= 5; x++) add(x, 0)
  add(1, 1)   // 连接房屋 (0,1) 的支路
  add(3, 1)   // 连接集市 (3,2) 的支路，让居民能通勤上班
  return r
}

export function logicalMigrantPos(m:Migrant) {
  const a=m.route[m.routeIndex]??m.route[m.route.length-1]??{x:0,y:0}
  const b=m.route[m.routeIndex+1]??a
  return{x:a.x+(b.x-a.x)*m.routeT, y:a.y+(b.y-a.y)*m.routeT}
}
export function logicalWalkerPos(w:Walker) {
  const a=w.route[w.routeIndex]??w.route[w.route.length-1]??{x:0,y:0}
  const b=w.route[w.routeIndex+1]??a
  return{x:a.x+(b.x-a.x)*w.routeT, y:a.y+(b.y-a.y)*w.routeT}
}
export function logicalOxCartPos(c:OxCart) {
  const a=c.route[c.routeIndex]??c.route[c.route.length-1]??{x:0,y:0}
  const b=c.route[c.routeIndex+1]??a
  return{x:a.x+(b.x-a.x)*c.routeT, y:a.y+(b.y-a.y)*c.routeT}
}
export function logicalMarketBuyerPos(mb:MarketBuyer) {
  const a=mb.route[mb.routeIndex]??mb.route[mb.route.length-1]??{x:0,y:0}
  const b=mb.route[mb.routeIndex+1]??a
  return{x:a.x+(b.x-a.x)*mb.routeT, y:a.y+(b.y-a.y)*mb.routeT}
}
export function logicalPeddlerPos(p: Peddler) {
  return { x: p.fromTile.x + (p.toTile.x - p.fromTile.x) * p.segT,
           y: p.fromTile.y + (p.toTile.y - p.fromTile.y) * p.segT }
}
function getMarketCfg(id: string, cfg: Record<string, MarketConfig>): MarketConfig {
  return cfg[id] ?? DEFAULT_MARKET_CFG
}
function computeMarketCap(markets: Building[], cfg: Record<string, MarketConfig>): number {
  return markets.reduce((s, m) => s + getMarketCfg(m.id, cfg).shopkeepers * MARKET_CAP_PER_SHOP, 0)
}
function pickNextPeddlerTile(
  cur: {x:number;y:number}, prev: {x:number;y:number}|null,
  roads: {x:number;y:number}[]
): {x:number;y:number}|null {
  const adj = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]
    .map(d => ({x:cur.x+d.x, y:cur.y+d.y})).filter(t => isRoadAt(roads,t.x,t.y))
  const pool = (prev ? adj.filter(t => !(t.x===prev.x&&t.y===prev.y)) : adj)
  return (pool.length>0 ? pool : adj)[Math.floor(Math.random()*((pool.length>0?pool:adj).length))] ?? null
}
function createEmptyPeddlerCargo(): PeddlerCargo { return { crops: createEmptyInventory(), ironTools: 0 } }
function isPeddlerCargoEmpty(c: PeddlerCargo): boolean { return inventoryTotal(c.crops)<0.1 && c.ironTools===0 }

// ─── Initial state ────────────────────────────────────────────────────────

const initial:CityState = {
  money:5000, population:2, tick:0, running:false,
  buildings:[
    {id:'b-house-1',  type:'house',   x:0, y:1, capacity:6, occupants:2, workerSlots:0, cost:100},
    {id:'b-market-1', type:'market',  x:3, y:2, capacity:0, occupants:0, workerSlots:4, cost:300},
  ],
  roads: createHighwayRoads(),
  farmZones: [],
  selectedBuildingType:null, selectedTool:'pan', selectedBuildingId:null, selectedCitizenId:null, selectedFarmZoneId:null,
  lastAction:null, lastBuildAttempt:null,
  citizens:[
    {id:'c-1',name:'赵景行',age:28,gender:'male',houseId:'b-house-1',workplaceId:'b-market-1',farmZoneId:null,profession:'merchant',
     satisfaction:72,needs:{food:0.68,safety:0.72,culture:0.55},isAtHome:true,isSick:false,sickTicks:0},
    {id:'c-2',name:'李清婉',age:24,gender:'female',houseId:'b-house-1',workplaceId:'b-market-1',farmZoneId:null,profession:'merchant',
     satisfaction:70,needs:{food:0.62,safety:0.7,culture:0.56},isAtHome:true,isSick:false,sickTicks:0},
  ],
  houseFood:{'b-house-1':15},
  houseCrops:{'b-house-1':{rice:15,millet:0,wheat:0,soybean:0,vegetable:0}},
  houseSavings:{'b-house-1':200},
  taxRates:{ding:5,tian:0.10,shang:0.05},
  monthlyFarmOutput:0, monthlyFarmValue:0, monthlyMarketSales:0,
  lastMonthlyFarmValue:0, lastMonthlyMarketSales:0,
  lastTaxBreakdown:{ding:0,tian:0,shang:0},
  lastMonthlyExpenseBreakdown:{yangmin:0,jianshe:0,total:0},
  monthlyConstructionCost:0,
  mineInventory:0, smithInventory:0,
  houseTools:{'b-house-1':0},
  farmInventory:createEmptyInventory(),
  granaryInventory:createEmptyInventory(),
  marketInventory:{rice:10, millet:0, wheat:0, soybean:0, vegetable:0},
  migrants:[], walkers:[], peddlers:[],
  farmPiles:[], oxCarts:[], marketBuyers:[],
  marketConfig:{'b-market-1': DEFAULT_MARKET_CFG},
  month:1, dayTime:0.5, dayCount:1,
  lastHouseholdBuyDay:0,
  lastMonthlyTax:0, avgSatisfaction:71, needPressure:{food:32,safety:28,culture:44},
  houseDead:{},
}

// ─── Context ──────────────────────────────────────────────────────────────

const SimulationContext = createContext<{
  state:CityState; start:()=>void; stop:()=>void
  setMoney:(v:number)=>void; setPopulation:(v:number)=>void
  placeBuilding:(x:number,y:number,type?:BuildingType)=>void
  removeBuilding:(id:string)=>void; selectBuildingType:(t:BuildingType|null)=>void
  placeRoad:(x:number,y:number)=>void; removeRoad:(x:number,y:number)=>void
  placeFarmZone:(x:number,y:number)=>void; removeFarmZone:(x:number,y:number)=>void
  selectFarmZone:(id:string|null)=>void; setFarmCrop:(id:string,crop:CropType)=>void
  setTaxRates:(rates:{ding:number;tian:number;shang:number})=>void
  selectTool:(t:Tool)=>void; selectBuilding:(id:string|null)=>void
  selectCitizen:(id:string|null)=>void
  setMarketConfig:(id:string, cfg:MarketConfig)=>void
}>({
  state:initial, start:()=>{}, stop:()=>{}, setMoney:()=>{}, setPopulation:()=>{},
  placeBuilding:()=>{}, removeBuilding:()=>{}, selectBuildingType:()=>{},
  placeRoad:()=>{}, removeRoad:()=>{}, placeFarmZone:()=>{}, removeFarmZone:()=>{},
  selectFarmZone:()=>{}, setFarmCrop:()=>{}, setTaxRates:()=>{},
  selectTool:()=>{}, selectBuilding:()=>{}, selectCitizen:()=>{},
  setMarketConfig:()=>{},
})

// ─── Provider ─────────────────────────────────────────────────────────────

export function SimulationProvider({children}:{children:React.ReactNode}) {
  const [state,setState] = useState<CityState>(initial)
  const interval = useRef<number|null>(null)

  useEffect(()=>{
    if(state.running && interval.current==null) {
      interval.current = window.setInterval(()=>{
        setState(s=>{
          const nextTick = s.tick+1
          const prevDay  = s.dayTime
          const nextDay  = (s.dayTime + 1/DAY_TICKS) % 1
          const isNewDay = nextDay < prevDay
          const dayCount = isNewDay ? s.dayCount+1 : s.dayCount

          const houses      = s.buildings.filter(b=>b.type==='house')
          const houseMap    = new Map(houses.map(h=>[h.id,h]))
          const buildingMap = new Map(s.buildings.map(b=>[b.id,b]))
          const workplacePos = s.buildings.filter(b=>b.type!=='house').map(b=>({x:b.x,y:b.y}))
          const houseFood: Record<string, number> = { ...s.houseFood }
          const houseCrops: Record<string, CropInventory> = Object.fromEntries(
            Object.entries(s.houseCrops).map(([k,v])=>[k,{...v}])
          )
          const houseSavings: Record<string, number> = { ...s.houseSavings }
          const houseDead: Record<string, number> = { ...s.houseDead }
          let monthlyFarmOutput = s.monthlyFarmOutput
          let monthlyFarmValue = s.monthlyFarmValue
          let monthlyMarketSales = s.monthlyMarketSales
          let mineInventory  = s.mineInventory
          let smithInventory = s.smithInventory
          const houseTools: Record<string, number> = { ...s.houseTools }
          const farmInventory: CropInventory = { ...s.farmInventory }
          const granaryInventory: CropInventory = { ...s.granaryInventory }
          const marketInventory: CropInventory = { ...s.marketInventory }

          const farmZones = s.farmZones

          // ── 稳定农田分配 ───────────────────────────────────────────────
          const farmZoneAssigned = new Set<string>()
          let citizens = s.citizens.map(c => {
            if (c.workplaceId) return c.farmZoneId ? { ...c, farmZoneId: null } : c
            if (c.farmZoneId) {
              const zone = farmZones.find(z => z.id === c.farmZoneId)
              if (!zone) return { ...c, farmZoneId: null, profession: null }
              farmZoneAssigned.add(c.farmZoneId)
              return { ...c, profession: 'farmer' as Profession }
            }
            return c
          })
          const unassignedZones = farmZones.filter(z => {
            if (farmZoneAssigned.has(z.id)) return false
            // 只分配有路可达的农田
            for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++)
              if (adjacentHasRoad(s.roads, z.x + dx, z.y + dy)) return true
            return false
          })
          const unassignedWorkers = citizens.filter(c => !c.workplaceId && !c.farmZoneId)
          for (let i = 0; i < Math.min(unassignedZones.length, unassignedWorkers.length); i++) {
            const idx = citizens.findIndex(c => c.id === unassignedWorkers[i].id)
            if (idx >= 0) citizens[idx] = { ...citizens[idx], farmZoneId: unassignedZones[i].id, profession: 'farmer' as Profession }
          }

          // ── 5天生长周期 + 收获 → FarmPile ────────────────────────────
          const FARM_CYCLE_TICKS = 5 * DAY_TICKS
          const HARVEST_YIELD_BASE = 15

          let farmPiles = s.farmPiles.map(p => ({ ...p, age: p.age + 1 }))
          const updatedFarmZones = farmZones.map(zone => {
            // 已有待收割的堆积物 → 卡住生产，等牛车来
            const hasPendingPile = farmPiles.some(p => p.zoneId === zone.id)
            if (hasPendingPile) return zone
            // 无路可达的农田不生长
            const zoneHasRoad = (() => {
              for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++)
                if (adjacentHasRoad(s.roads, zone.x + dx, zone.y + dy)) return true
              return false
            })()
            const farmer = zoneHasRoad ? citizens.find(c => c.farmZoneId === zone.id && !c.isSick) : undefined
            if (!farmer) return zone
            // 新周期开始（growthProgress===0）时应用待切换作物
            const eff: FarmZone = (zone.growthProgress === 0 && zone.pendingCropType)
              ? { ...zone, cropType: zone.pendingCropType, pendingCropType: undefined }
              : zone
            const cropCfg = (configData.crops as any)[eff.cropType]
            const fertility = (
              terrainFertilityAt(eff.x, eff.y) + terrainFertilityAt(eff.x+1, eff.y) +
              terrainFertilityAt(eff.x, eff.y+1) + terrainFertilityAt(eff.x+1, eff.y+1)
            ) / 4
            const farmerTools    = houseTools[farmer.houseId] ?? 0
            const toolMultiplier = farmerTools > 0 ? TOOL_EFFICIENCY_BONUS : 1.0
            const efficiency = Math.max(0.5, Math.min(1.5, 0.5 + farmer.satisfaction / 100)) * toolMultiplier
            const newProgress = eff.growthProgress + (1 / FARM_CYCLE_TICKS) * efficiency
            if (newProgress >= 1) {
              const yieldAmt = clampCrop(HARVEST_YIELD_BASE * fertility * (cropCfg?.fertilityWeight ?? 1))
              farmPiles.push({
                id: `pile-${nextTick}-${eff.id.slice(-5)}`,
                zoneId: eff.id, x: eff.x, y: eff.y,
                cropType: eff.cropType, amount: yieldAmt, age: 0,
              })
              monthlyFarmOutput += yieldAmt
              monthlyFarmValue += yieldAmt * cropPrice(eff.cropType)
              // 收割后重置：pendingCropType 留到下个周期开始时再应用（growthProgress===0 的下一帧）
              return { ...eff, growthProgress: 0 }
            }
            return { ...eff, growthProgress: newProgress }
          })

          // 堆积物永久保留直到牛车运走，不再自动入库
          // （玩家必须建造并连通粮仓才能疏导）

          // ── 牛车物流：粮仓 → 农田堆 → 粮仓 ─────────────────────────
          const granaries = s.buildings.filter(b => b.type === 'granary')
          const arrivedOxCarts: OxCart[] = []
          let oxCarts = s.oxCarts.map(c => ({ ...c, route: c.route.map(p => ({ ...p })) }))
          oxCarts = oxCarts.filter(cart => {
            let rem = cart.speed * (SIM_TICK_MS / 1000)
            while (rem > 0 && cart.routeIndex < cart.route.length - 1) {
              const seg = 1 - cart.routeT
              if (rem < seg) { cart.routeT += rem; rem = 0 }
              else { rem -= seg; cart.routeIndex += 1; cart.routeT = 0 }
            }
            // 到达农田 waypoint → 拾取堆
            if (cart.routeIndex >= cart.pileWaypointIndex && !cart.pickedUp) {
              const idx = farmPiles.findIndex(p => p.id === cart.pileId)
              if (idx >= 0) {
                cart.cargoAmount = farmPiles[idx].amount
                cart.cargoType = farmPiles[idx].cropType
                farmPiles.splice(idx, 1)
              }
              cart.pickedUp = true
            }
            if (cart.routeIndex >= cart.route.length - 1) { arrivedOxCarts.push(cart); return false }
            return true
          })
          for (const cart of arrivedOxCarts) {
            if (cart.cargoAmount > 0) {
              // 粮仓有容量上限：全城粮仓总量 = granaries.length × GRANARY_CAPACITY_PER
              const granaryCapacity = granaries.length * GRANARY_CAPACITY_PER
              const currentTotal = inventoryTotal(granaryInventory)
              const canStore = Math.max(0, granaryCapacity - currentTotal)
              const stored = Math.min(cart.cargoAmount, canStore)
              if (stored > 0)
                granaryInventory[cart.cargoType] = clampCrop(granaryInventory[cart.cargoType] + stored)
            }
            farmPiles = farmPiles.filter(p => p.id !== cart.pileId)
          }
          // 为无人认领的堆派牛车（白天 + 粮仓有仓丁 + 有路可走）
          const assignedPileIds = new Set(oxCarts.map(c => c.pileId))
          const isDaytime = s.dayTime >= MORNING_START && s.dayTime <= EVENING_START
          if (isDaytime) {
            for (const pile of farmPiles) {
              if (assignedPileIds.has(pile.id) || granaries.length === 0) continue
              // 只用有仓丁在岗的粮仓
              const workingGranaries = granaries.filter(g =>
                citizens.some(c => c.workplaceId === g.id && !c.isSick)
              )
              if (workingGranaries.length === 0) continue
              const g = workingGranaries.reduce((b, gr) => {
                const d1=(gr.x-pile.x)**2+(gr.y-pile.y)**2, d2=(b.x-pile.x)**2+(b.y-pile.y)**2
                return d1 < d2 ? gr : b
              })
              const cartRoute = buildOxCartRoute(g, pile, s.roads)
              if (!cartRoute) continue   // 无路可达，不派
              oxCarts.push({
                id: `cart-${nextTick}-${pile.id.slice(-5)}`, pileId: pile.id, granaryId: g.id,
                route: cartRoute.route,
                routeIndex: 0, routeT: 0, speed: OX_CART_SPEED,
                pickedUp: false, cargoType: pile.cropType, cargoAmount: 0,
                pileWaypointIndex: cartRoute.pileWaypointIndex,
              })
              assignedPileIds.add(pile.id)
            }
          }
          // farmInventory 是旧系统遗留，现由 FarmPile→OxCart→granary 接管，此处无需再转移
          // （farmInventory 在当前版本中始终为空，保留字段仅为兼容性）

          // ── 行商批发：集市 → 粮仓 → 集市 ───────────────────────────
          const marketsList = s.buildings.filter(b => b.type === 'market')
          const arrivedBuyers: MarketBuyer[] = []
          let marketBuyers = s.marketBuyers.map(mb => ({ ...mb, route: mb.route.map(p => ({ ...p })) }))
          marketBuyers = marketBuyers.filter(mb => {
            let rem = mb.speed * (SIM_TICK_MS / 1000)
            while (rem > 0 && mb.routeIndex < mb.route.length - 1) {
              const seg = 1 - mb.routeT
              if (rem < seg) { mb.routeT += rem; rem = 0 }
              else { rem -= seg; mb.routeIndex += 1; mb.routeT = 0 }
            }
            // 到达粮仓 waypoint → 批发
            if (mb.routeIndex >= 1 && !mb.pickedUp) {
              const total = inventoryTotal(granaryInventory)
              if (total > 1) {
                const pickAmt = Math.min(20, total)
                const topCrop = CROP_KEYS.reduce((best, k) =>
                  granaryInventory[k] > granaryInventory[best] ? k : best, CROP_KEYS[0])
                const take = Math.min(pickAmt, granaryInventory[topCrop])
                granaryInventory[topCrop] = clampCrop(granaryInventory[topCrop] - take)
                mb.cargoType = topCrop; mb.cargoAmount = take
              }
              mb.pickedUp = true
            }
            if (mb.routeIndex >= mb.route.length - 1) { arrivedBuyers.push(mb); return false }
            return true
          })
          for (const mb of arrivedBuyers) {
            if (mb.cargoAmount > 0) {
              // 集市容量：由坐贾数决定（每名坐贾 MARKET_CAP_PER_SHOP 担）
              const marketCapacity = computeMarketCap(marketsList, s.marketConfig)
              const currentMarketTotal = inventoryTotal(marketInventory)
              const canStock = Math.max(0, marketCapacity - currentMarketTotal)
              const stocked = Math.min(mb.cargoAmount, canStock)
              if (stocked > 0)
                marketInventory[mb.cargoType] = clampCrop(marketInventory[mb.cargoType] + stocked)
              monthlyMarketSales += stocked * cropPrice(mb.cargoType)
            }
          }

          // ── 行商游走与售货 ──────────────────────────────────────────────
          const smithBldgs = s.buildings.filter(b => b.type === 'blacksmith')
          let peddlers = s.peddlers.map(p => ({ ...p, cargo: { ...p.cargo, crops: { ...p.cargo.crops } } }))
          const arrivedPeddlers: Peddler[] = []
          peddlers = peddlers.filter(p => {
            p.segT += p.speed * (SIM_TICK_MS / 1000)
            if (p.segT < 1) return true
            p.segT -= 1
            p.fromTile = { ...p.toTile }

            if (p.phase === 'outbound') {
              p.stepsLeft--
              const tile = p.fromTile
              // ── 向周边建筑/农田售货（可按 cargo 字段扩展更多品类）──────────
              // 1. 民居：出售粮食
              for (const house of houses) {
                if (inventoryTotal(p.cargo.crops) < 0.1) break
                if (Math.abs(house.x-tile.x)+Math.abs(house.y-tile.y) > 1) continue
                const hcNow = { ...(houseCrops[house.id] ?? createEmptyInventory()) }
                const foodTotal = inventoryTotal(hcNow)
                if (foodTotal >= PEDDLER_FOOD_THRESH) continue
                const sav = houseSavings[house.id] ?? 0
                if (sav <= 0) continue
                const want = Math.min(PEDDLER_SELL_FOOD, PEDDLER_FOOD_THRESH - foodTotal)
                let moved = 0, cost = 0
                for (const k of CROP_KEYS) {
                  if (moved >= want || p.cargo.crops[k] < 0.01 || sav-cost <= 0) continue
                  const take = Math.min(p.cargo.crops[k], want-moved, (sav-cost)/cropPrice(k))
                  if (take < 0.01) continue
                  p.cargo.crops[k] = clampCrop(p.cargo.crops[k]-take)
                  hcNow[k] = clampCrop(hcNow[k]+take)
                  moved += take; cost += take*cropPrice(k)
                }
                if (moved > 0) {
                  houseCrops[house.id] = hcNow
                  houseFood[house.id] = clampFood(inventoryTotal(hcNow))
                  houseSavings[house.id] = Math.max(0, sav-cost)
                }
              }
              // 2. 农田：出售铁器
              if (p.cargo.ironTools > 0) {
                for (const zone of farmZones) {
                  if (p.cargo.ironTools <= 0) break
                  let near = false
                  for (let dx=0;dx<=1&&!near;dx++) for (let dy=0;dy<=1&&!near;dy++)
                    if (Math.abs((zone.x+dx)-tile.x)+Math.abs((zone.y+dy)-tile.y)<=1) near=true
                  if (!near) continue
                  const farmer = citizens.find(c => c.farmZoneId===zone.id)
                  if (!farmer || (houseTools[farmer.houseId]??0)>0) continue
                  const sav = houseSavings[farmer.houseId]??0
                  if (sav < FARM_TOOL_PRICE) continue
                  p.cargo.ironTools--
                  houseTools[farmer.houseId] = (houseTools[farmer.houseId]??0)+1
                  houseSavings[farmer.houseId] = Math.max(0, sav-FARM_TOOL_PRICE)
                }
              }
              // ── 判断折返 ───────────────────────────────────────────────
              if (p.stepsLeft <= 0 || isPeddlerCargoEmpty(p.cargo)) {
                const market = buildingMap.get(p.marketId)
                if (!market) return false
                const mRoads = roadsAdjacent(s.roads, market.x, market.y)
                let best: {x:number;y:number}[]|null = null
                for (const mr of mRoads) {
                  const path = findRoadPath(s.roads, p.fromTile, mr)
                  if (path && (!best||path.length<best.length)) best=path
                }
                if (!best) return false
                p.phase='returning'; p.returnRoute=best; p.returnIdx=0; p.toTile=best[0]
              } else {
                const next = pickNextPeddlerTile(p.fromTile, p.prevTile, s.roads)
                if (next) { p.prevTile={...p.fromTile}; p.toTile=next } else { p.stepsLeft=0 }
              }
            } else {
              // returning：沿 A* 路径回集市，不卖货
              p.returnIdx++
              if (p.returnIdx >= p.returnRoute.length) { arrivedPeddlers.push(p); return false }
              p.toTile = p.returnRoute[p.returnIdx]
            }
            return true
          })
          // 回到集市：剩余货物回填
          for (const p of arrivedPeddlers) {
            const mktCap = computeMarketCap(marketsList, s.marketConfig)
            const canStock = Math.max(0, mktCap - inventoryTotal(marketInventory))
            if (canStock > 0) transferInventory(p.cargo.crops, marketInventory, Math.min(inventoryTotal(p.cargo.crops), canStock))
            if (p.cargo.ironTools > 0) smithInventory = Math.min(smithInventory+p.cargo.ironTools, smithBldgs.length*SMITH_CAPACITY_PER)
          }

          // ── 应急补货逻辑移至 crossedMorning 之后（见下方）───────────────
          const granaryCount = granaries.length
          const marketCount = marketsList.length

          // ── 每日消耗与积蓄（isNewDay block）────────────────────────
          if (isNewDay) {
            // 矿山出矿：每名矿工每日产 ORE_PER_MINER_DAY 担矿石
            const mines = s.buildings.filter(b => b.type === 'mine')
            if (mines.length > 0) {
              const capacity = mines.length * MINE_CAPACITY_PER
              for (const mine of mines) {
                const miners = citizens.filter(c => c.workplaceId === mine.id && !c.isSick)
                const produced = miners.length * ORE_PER_MINER_DAY
                const canStore = Math.max(0, capacity - mineInventory)
                mineInventory = Math.min(mineInventory + Math.min(produced, canStore), capacity)
              }
            }
            // 铁匠铺打铁：消耗矿石，每日每名铁匠打1件农具（曲辕犁/锄头/镰刀等）
            const smithBuildings = s.buildings.filter(b => b.type === 'blacksmith')
            if (smithBuildings.length > 0) {
              const capacity = smithBuildings.length * SMITH_CAPACITY_PER
              for (const smith of smithBuildings) {
                const smiths = citizens.filter(c => c.workplaceId === smith.id && !c.isSick)
                if (smiths.length === 0) continue
                const wantMake = smiths.length  // 每铁匠每日打1件
                const oreNeeded = wantMake * ORE_PER_TOOL
                const oreUsed = Math.min(mineInventory, oreNeeded)
                const toolsMade = Math.floor(oreUsed / ORE_PER_TOOL)
                mineInventory  = Math.max(0, mineInventory - toolsMade * ORE_PER_TOOL)
                const canStore = Math.max(0, capacity - smithInventory)
                smithInventory = Math.min(smithInventory + Math.min(toolsMade, canStore), capacity)
              }
            }
            for (const h of houses) {
              const residents = citizens.filter(c => c.houseId === h.id)
              if (!residents.length) continue
              // 日耗粮：0.5担/人/日，按比例从各类粮食扣除
              const hc = { ...(houseCrops[h.id] ?? createEmptyInventory()) }
              const totalHc = CROP_KEYS.reduce((s, k) => s + hc[k], 0)
              if (totalHc > 0) {
                const consume = Math.min(0.5 * residents.length, totalHc)
                for (const k of CROP_KEYS)
                  hc[k] = clampCrop(hc[k] - Math.min(hc[k], consume * (hc[k] / totalHc)))
                houseCrops[h.id] = hc
                houseFood[h.id] = clampFood(CROP_KEYS.reduce((s, k) => s + hc[k], 0))
              }
              // 日进积蓄：在岗者每人每日 3 钱
              const working = residents.filter(c => (c.workplaceId || c.farmZoneId) && !c.isSick).length
              houseSavings[h.id] = (houseSavings[h.id] ?? 0) + working * 3
            }
          }

          // Needs + satisfaction
          citizens = citizens.map(c=>{
            const house=houseMap.get(c.houseId); if(!house) return c
            const prevFood = houseFood[c.houseId] ?? 0

            const starving = prevFood <= 0.05
            let isSick = c.isSick
            if(starving && !isSick && Math.random() < 0.003) isSick = true
            if(!starving && isSick && prevFood > 2 && Math.random() < 0.0025) isSick = false

            // 患病计时：恢复则清零，否则每帧递增
            const sickTicks = isSick ? (c.sickTicks ?? 0) + 1 : 0

            const nearWork = workplacePos.some(p=>distance(p,house)<=8) && !isSick
            const hasRoad  = adjacentHasRoad(s.roads,house.x,house.y)
            const n={...c.needs}
            n.food    = clamp01(n.food    + (starving ? -0.03 : (nearWork ? 0.02  : -0.015)))
            n.safety  = clamp01(n.safety  + (hasRoad  ? 0.01  : -0.013))
            n.culture = clamp01(n.culture + (workplacePos.length>0 ? 0.008 : -0.01))
            if(isSick){
              n.food = clamp01(n.food - 0.01)
              n.safety = clamp01(n.safety - 0.005)
            }
            // 安乐加成：饮食多样（多种粮食）提升民心
            const hc = houseCrops[c.houseId]
            const dietCount = hc ? CROP_KEYS.filter(k => hc[k] > 0.1).length : 0
            const anleBonus = dietCount <= 1 ? 0 : dietCount === 2 ? 5 : dietCount === 3 ? 10 : 15
            const score=(n.food*0.45+n.safety*0.35+n.culture*0.2)*100-(isSick?8:0)+anleBonus
            return{...c,needs:n,isSick,sickTicks,satisfaction:Math.round(Math.max(0,Math.min(100,score)))}
          })

          // ── 疫病：久病不愈则死亡 ──────────────────────────────────────────
          const dying = citizens.filter(c => c.sickTicks >= SICK_DEATH_TICKS)
          if (dying.length > 0) {
            citizens = citizens.filter(c => c.sickTicks < SICK_DEATH_TICKS)
            for (const dead of dying) {
              houseDead[dead.houseId] = (houseDead[dead.houseId] ?? 0) + 1
            }
          }

          // ── 疫病传播：亡者积累 → 向邻近房屋扩散 ─────────────────────────
          for (const h of houses) {
            const deadCount = houseDead[h.id] ?? 0
            if (deadCount < DEAD_SPREAD_THRESHOLD) continue
            citizens = citizens.map(c => {
              if (c.isSick) return c
              const nh = houseMap.get(c.houseId)
              if (!nh || nh.id === h.id) return c
              if (Math.abs(nh.x - h.x) > DEAD_SPREAD_RADIUS || Math.abs(nh.y - h.y) > DEAD_SPREAD_RADIUS) return c
              if (Math.random() < DEAD_SPREAD_CHANCE) return { ...c, isSick: true }
              return c
            })
          }

          // 移除已死亡居民对应的行走路径
          const aliveIds = new Set(citizens.map(c => c.id))
          const arrivedWalkers:Walker[]=[]
          let walkers=s.walkers
            .filter(w => aliveIds.has(w.citizenId))
            .map(w=>({...w,route:w.route.map(p=>({...p}))}))
          walkers=walkers.filter(w=>{
            let rem=w.speed*(SIM_TICK_MS/1000)
            while(rem>0&&w.routeIndex<w.route.length-1){
              const seg=1-w.routeT
              if(rem<seg){w.routeT+=rem;rem=0}else{rem-=seg;w.routeIndex+=1;w.routeT=0}
            }
            if(w.routeIndex>=w.route.length-1){arrivedWalkers.push(w);return false}
            return true
          })
          for(const w of arrivedWalkers){
            const idx=citizens.findIndex(c=>c.id===w.citizenId)
            if(idx<0) continue
            if(w.purpose==='toShop'){
              // 市民到达集市：在此结账，货物装入篮子随人带回
              const houseId = citizens[idx].houseId
              const hcNow   = houseCrops[houseId] ?? createEmptyInventory()
              const stored  = CROP_KEYS.reduce((s,k) => s + hcNow[k], 0)
              const demand  = Math.max(0, Math.min(10, 30 - stored))
              const basket  = createEmptyInventory()   // 购物篮
              let totalCost = 0
              if(demand > 0){
                const available = CROP_KEYS.filter(k => marketInventory[k] > 0)
                if(available.length > 0){
                  const perCrop = demand / available.length
                  for(const k of available){
                    const take = Math.min(marketInventory[k], perCrop)
                    marketInventory[k] = clampCrop(marketInventory[k] - take)
                    basket[k]          = clampCrop(basket[k] + take)
                    totalCost         += take * cropPrice(k)
                  }
                }
              }
              // 在集市付钱（houseSavings 扣款）
              houseSavings[houseId] = Math.max(0, (houseSavings[houseId] ?? 0) - totalCost)
              // ── 农夫顺便在集市购置铁制农具（曲辕犁/锄头/镰刀等）──────────
              // 铁匠铺打制的农具由集市代售；农夫若无铁器且积蓄充足，当场购入一套
              if (citizens[idx].farmZoneId && smithInventory > 0 && (houseTools[houseId] ?? 0) === 0) {
                const savingsNow = houseSavings[houseId] ?? 0
                if (savingsNow >= FARM_TOOL_PRICE) {
                  smithInventory = Math.max(0, smithInventory - 1)
                  houseSavings[houseId] = Math.max(0, savingsNow - FARM_TOOL_PRICE)
                  houseTools[houseId] = (houseTools[houseId] ?? 0) + 1
                }
              }
              // 生成「带货回家」walker；houseCrops 此时不动，货物随人走
              const house  = houseMap.get(houseId)
              const market = w.targetId ? s.buildings.find(b => b.id === w.targetId) : null
              if(house && market){
                walkers = [...walkers, {
                  id: `w-${nextTick}-${citizens[idx].id}-home`,
                  citizenId: citizens[idx].id,
                  route: [{ x: market.x, y: market.y }, { x: house.x, y: house.y }],
                  routeIndex: 0, routeT: 0, speed: WALKER_SPEED,
                  purpose: 'fromShop',
                  cargo: basket,   // 货物随人携带
                }]
              }
            } else if(w.purpose==='fromShop'){
              // 市民到家：将购物篮里的货物入库，才算真正到手
              const houseId = citizens[idx].houseId
              if(w.cargo){
                const hc = { ...(houseCrops[houseId] ?? createEmptyInventory()) }
                for(const k of CROP_KEYS) hc[k] = clampCrop(hc[k] + (w.cargo[k] ?? 0))
                houseCrops[houseId] = hc
                houseFood[houseId]  = clampFood(CROP_KEYS.reduce((s,k) => s + hc[k], 0))
              }
              citizens[idx] = { ...citizens[idx], isAtHome: true }
            } else {
              citizens[idx]={...citizens[idx],isAtHome:w.purpose==='toHome'}
            }
          }

          // Commuting triggers
          const crossedMorning = prevDay < MORNING_START && nextDay >= MORNING_START
          const crossedEvening = prevDay < EVENING_START && nextDay >= EVENING_START
          const activeIds = new Set(walkers.map(w=>w.citizenId))

          if(crossedMorning){
            // 建筑工人通勤
            for(const c of citizens){
              if(!c.workplaceId||!c.isAtHome||c.isSick||activeIds.has(c.id)) continue
              const house=houseMap.get(c.houseId); const wp=buildingMap.get(c.workplaceId)
              if(!house||!wp) continue
              const route=bestPath(s.roads,house,wp)
              if(!route||route.length<2) continue
              walkers=[...walkers,{id:`w-${nextTick}-${c.id}-work`,citizenId:c.id,route,routeIndex:0,routeT:0,speed:WALKER_SPEED,purpose:'toWork'}]
              activeIds.add(c.id)
            }
            // 农夫前往农田（沿道路行走，不瞬移）
            for(const c of citizens){
              if(!c.farmZoneId||!c.isAtHome||c.isSick||activeIds.has(c.id)) continue
              const zone=updatedFarmZones.find(z=>z.id===c.farmZoneId)
              const house=houseMap.get(c.houseId)
              if(!zone||!house) continue
              // 找农田边的路格
              const farmRoads:{x:number,y:number}[]=[]
              for(let dx=0;dx<=1;dx++) for(let dy=0;dy<=1;dy++){
                const tx=zone.x+dx,ty=zone.y+dy
                for(const[ddx,ddy] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]){
                  if(isRoadAt(s.roads,tx+ddx,ty+ddy)) farmRoads.push({x:tx+ddx,y:ty+ddy})
                }
              }
              // 沿道路寻路
              let roadSeg:{x:number,y:number}[]|null=null
              for(const hr of roadsAdjacent(s.roads,house.x,house.y)){
                for(const fr of farmRoads){
                  const p=findRoadPath(s.roads,hr,fr)
                  if(p&&(!roadSeg||p.length<roadSeg.length)) roadSeg=p
                }
              }
              if(!roadSeg) continue  // 无路可达，不去
              const route=[{x:house.x,y:house.y},...roadSeg,{x:zone.x,y:zone.y}]
              walkers=[...walkers,{id:`w-${nextTick}-${c.id}-work`,citizenId:c.id,route,routeIndex:0,routeT:0,speed:WALKER_SPEED,purpose:'toWork'}]
              activeIds.add(c.id)
            }

            // ── 出门买粮（农夫同时可在集市购铁器）──────────────────────────
            if(marketsList.length > 0 && inventoryTotal(marketInventory) > 0){
              const isShopDay = isNewDay && dayCount % SHOP_INTERVAL_DAYS === 0
              for(const c of citizens){
                if(!c.isAtHome || c.isSick || activeIds.has(c.id)) continue
                const house = houseMap.get(c.houseId); if(!house) continue
                const savings  = houseSavings[c.houseId] ?? 0
                const hcNow    = houseCrops[c.houseId]
                const hcTotal  = hcNow ? CROP_KEYS.reduce((s,k) => s + hcNow[k], 0) : (houseFood[c.houseId] ?? 0)

                // 旬休日：存粮低于 20 担则强制去市场
                // 平日：存粮告急(<10)必去；有余量(<22)且有积蓄则按 8% 随机闲逛
                // 农夫：若无铁器且集市有售且积蓄充足，也会前往购置
                const mustGo    = hcTotal < 10 && savings > 0
                const wantMore  = hcTotal < 22 && savings > 8
                const randomWander = hcTotal < 25 && savings > 3 && Math.random() < 0.08
                const needsTool = Boolean(c.farmZoneId) && (houseTools[c.houseId] ?? 0) === 0
                  && smithInventory > 0 && savings >= FARM_TOOL_PRICE && Math.random() < 0.18
                const trigger   = isShopDay ? hcTotal < 20 : (mustGo || wantMore || randomWander || needsTool)

                if(!trigger) continue
                if(savings <= 0 && hcTotal >= 5) continue  // 身无分文且不急，不出门

                const market = marketsList.reduce((best, m) => {
                  const d1 = (m.x-house.x)**2+(m.y-house.y)**2
                  const d2 = (best.x-house.x)**2+(best.y-house.y)**2
                  return d1 < d2 ? m : best
                })
                walkers = [...walkers, {
                  id: `w-${nextTick}-${c.id}-shop`, citizenId: c.id,
                  route: [{ x: house.x, y: house.y }, { x: market.x, y: market.y }],
                  routeIndex: 0, routeT: 0, speed: WALKER_SPEED,
                  purpose: 'toShop', targetId: market.id,
                }]
                activeIds.add(c.id)
              }
            }
            // 行商每日清晨出发批发
            for(const market of marketsList){
              if(marketBuyers.some(mb=>mb.marketId===market.id)) continue
              if(granaries.length===0||inventoryTotal(granaryInventory)<2) continue
              const g=granaries.reduce((b,gr)=>{
                const d1=(gr.x-market.x)**2+(gr.y-market.y)**2, d2=(b.x-market.x)**2+(b.y-market.y)**2
                return d1<d2?gr:b
              })
              marketBuyers.push({
                id:`mb-${nextTick}-${market.id.slice(-4)}`,
                marketId:market.id, granaryId:g.id,
                route:[{x:market.x,y:market.y},{x:g.x,y:g.y},{x:market.x,y:market.y}],
                routeIndex:0,routeT:0,speed:MARKET_BUYER_SPEED,
                pickedUp:false, cargoType:'rice', cargoAmount:0,
              })
            }
            // ── 行商（货郎）清晨出发走街串巷 ──────────────────────────────
            for (const market of marketsList) {
              if (!adjacentHasRoad(s.roads, market.x, market.y)) continue
              const cfg = getMarketCfg(market.id, s.marketConfig)
              const active = peddlers.filter(p => p.marketId===market.id).length
              const toSpawn = Math.max(0, cfg.peddlers - active)
              if (toSpawn === 0) continue
              const startRoads = roadsAdjacent(s.roads, market.x, market.y)
              if (startRoads.length === 0) continue
              const foodTotal = inventoryTotal(marketInventory)
              for (let i = 0; i < toSpawn; i++) {
                const cargo = createEmptyPeddlerCargo()
                // 携带粮食：从集市库存扣除
                if (foodTotal > 0.1) {
                  const carry = Math.min(PEDDLER_CARRY_FOOD, foodTotal / Math.max(1, toSpawn))
                  transferInventory(marketInventory, cargo.crops, carry)
                }
                // 携带铁器：从铁匠铺库存扣除
                if (smithInventory > 0) {
                  const carry = Math.min(PEDDLER_CARRY_TOOLS, smithInventory)
                  cargo.ironTools = carry; smithInventory -= carry
                }
                const startTile = startRoads[i % startRoads.length]
                peddlers.push({
                  id: `pd-${nextTick}-${market.id.slice(-4)}-${i}`,
                  marketId: market.id, cargo,
                  phase: 'outbound', stepsLeft: PEDDLER_MAX_STEPS,
                  fromTile: { x: market.x, y: market.y }, toTile: { ...startTile },
                  segT: 0, speed: PEDDLER_SPEED, prevTile: null,
                  returnRoute: [], returnIdx: 0,
                })
              }
            }
          }

          // ── 应急补货：集市库存告急（< 10担）且非清晨，随时派独轮车 ──────────
          if (isDaytime && !crossedMorning) {
            for (const market of marketsList) {
              if (marketBuyers.some(mb => mb.marketId === market.id)) continue
              if (inventoryTotal(marketInventory) >= 10) continue
              if (granaries.length === 0 || inventoryTotal(granaryInventory) < 2) continue
              const g = granaries.reduce((best, gr) => {
                const d1=(gr.x-market.x)**2+(gr.y-market.y)**2, d2=(best.x-market.x)**2+(best.y-market.y)**2
                return d1 < d2 ? gr : best
              })
              marketBuyers.push({
                id: `mb-${nextTick}-emg-${market.id.slice(-4)}`,
                marketId: market.id, granaryId: g.id,
                route: [{ x: market.x, y: market.y }, { x: g.x, y: g.y }, { x: market.x, y: market.y }],
                routeIndex: 0, routeT: 0, speed: MARKET_BUYER_SPEED,
                pickedUp: false, cargoType: 'rice', cargoAmount: 0,
              })
            }
          }

          if(crossedEvening){
            for(const c of citizens){
              if(!c.workplaceId||c.isAtHome||activeIds.has(c.id)) continue
              const house=houseMap.get(c.houseId); const wp=buildingMap.get(c.workplaceId)
              if(!house||!wp) continue
              const route=bestPath(s.roads,wp,house)
              if(!route||route.length<2) continue
              walkers=[...walkers,{id:`w-${nextTick}-${c.id}-home`,citizenId:c.id,route,routeIndex:0,routeT:0,speed:WALKER_SPEED,purpose:'toHome'}]
              activeIds.add(c.id)
            }
            // 农夫傍晚回家（沿道路）
            for(const c of citizens){
              if(!c.farmZoneId||c.isAtHome||activeIds.has(c.id)) continue
              const zone=updatedFarmZones.find(z=>z.id===c.farmZoneId)
              const house=houseMap.get(c.houseId)
              if(!zone||!house) continue
              const farmRoads:{x:number,y:number}[]=[]
              for(let dx=0;dx<=1;dx++) for(let dy=0;dy<=1;dy++){
                const tx=zone.x+dx,ty=zone.y+dy
                for(const[ddx,ddy] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]){
                  if(isRoadAt(s.roads,tx+ddx,ty+ddy)) farmRoads.push({x:tx+ddx,y:ty+ddy})
                }
              }
              let roadSeg:{x:number,y:number}[]|null=null
              for(const hr of roadsAdjacent(s.roads,house.x,house.y)){
                for(const fr of farmRoads){
                  const p=findRoadPath(s.roads,fr,hr)
                  if(p&&(!roadSeg||p.length<roadSeg.length)) roadSeg=p
                }
              }
              if(!roadSeg) continue
              const route=[{x:zone.x,y:zone.y},...roadSeg,{x:house.x,y:house.y}]
              walkers=[...walkers,{id:`w-${nextTick}-${c.id}-home`,citizenId:c.id,route,routeIndex:0,routeT:0,speed:WALKER_SPEED,purpose:'toHome'}]
              activeIds.add(c.id)
            }
          }

          // Advance migrants
          const arrivedMigrants:Migrant[]=[]
          let migrants=s.migrants.map(m=>({...m,route:m.route.map(p=>({...p}))}))
          migrants=migrants.filter(m=>{
            let rem=m.speed*(SIM_TICK_MS/1000)
            while(rem>0&&m.routeIndex<m.route.length-1){
              const seg=1-m.routeT
              if(rem<seg){m.routeT+=rem;rem=0}else{rem-=seg;m.routeIndex+=1;m.routeT=0}
            }
            if(m.routeIndex>=m.route.length-1){arrivedMigrants.push(m);return false}
            return true
          })
          for(const m of arrivedMigrants){
            const house=houseMap.get(m.targetHouseId); if(!house) continue
            const occ=citizens.filter(c=>c.houseId===house.id).length
            if(occ>=house.capacity) continue
            const seed=Date.now()+Math.random()*10000
            const needs=seededNeeds(seed)
            const sat=Math.round((needs.food*0.45+needs.safety*0.35+needs.culture*0.2)*100)
            const profile=createCitizenProfile(seed)
            // Assign workplace
            const occupiedSlots=new Map<string,number>()
            for(const c of citizens) if(c.workplaceId) occupiedSlots.set(c.workplaceId,(occupiedSlots.get(c.workplaceId)??0)+1)
            const wps=s.buildings.filter(b=>BUILDING_DEFS[b.type].workerSlots>0&&(occupiedSlots.get(b.id)??0)<BUILDING_DEFS[b.type].workerSlots&&adjacentHasRoad(s.roads,b.x,b.y))
            const wp=wps[Math.floor(Math.random()*wps.length)]??null
            citizens.push({
              id:`c-${Math.floor(seed)}`,houseId:house.id,
              name:profile.name,age:profile.age,gender:profile.gender,
              workplaceId:wp?.id??null, farmZoneId:null,
              profession:wp?PROFESSION_BY_BUILDING[wp.type]??null:null,
              needs,satisfaction:sat,isAtHome:true,isSick:false,sickTicks:0,
            })
          }

          // Spawn new migrant if vacancy
          const targetIds=new Set(migrants.map(m=>m.targetHouseId))
          const vacant=houses.filter(h=>{
            const occ=citizens.filter(c=>c.houseId===h.id).length+migrants.filter(m=>m.targetHouseId===h.id).length
            return occ<h.capacity&&adjacentHasRoad(s.roads,h.x,h.y)
          })
          const spawnH=vacant.find(h=>!targetIds.has(h.id))
          if(spawnH&&isRoadAt(s.roads,ENTRY_TILE.x,ENTRY_TILE.y)){
            const candidates=roadsAdjacent(s.roads,spawnH.x,spawnH.y)
              .map(tr=>findRoadPath(s.roads,ENTRY_TILE,tr))
              .filter((p):p is{x:number;y:number}[]=>Boolean(p))
              .sort((a,b)=>a.length-b.length)
            if(candidates.length>0){
              migrants=[...migrants,{
                id:`m-${nextTick}-${Math.floor(Math.random()*10000)}`,
                targetHouseId:spawnH.id,route:candidates[0],routeIndex:0,routeT:0,speed:MIGRANT_TILES_PER_SECOND,
              }]
            }
          }

          // 粮食入库唯一合法路径：市民走到集市购买 → 带货回家（fromShop walker 到达时入库）
          // 不存在任何隐式补粮逻辑

          // Sync occupants
          const occByHouse=new Map<string,number>()
          for(const c of citizens) occByHouse.set(c.houseId,(occByHouse.get(c.houseId)??0)+1)
          const buildings=s.buildings.map(b=>b.type==='house'?{...b,occupants:occByHouse.get(b.id)??0}:b)

          const population=citizens.length
          const avgSatisfaction=population>0?Math.round(citizens.reduce((s,c)=>s+c.satisfaction,0)/population):0
          const avgNeed=citizens.reduce((a,c)=>({food:a.food+c.needs.food,safety:a.safety+c.needs.safety,culture:a.culture+c.needs.culture}),{food:0,safety:0,culture:0})
          const needPressure=population>0?{
            food:Math.round((1-avgNeed.food/population)*100),
            safety:Math.round((1-avgNeed.safety/population)*100),
            culture:Math.round((1-avgNeed.culture/population)*100),
          }:{food:0,safety:0,culture:0}

          const monthlyDue=nextTick%MONTH_TICKS===0
          let lastTaxBreakdown = s.lastTaxBreakdown
          let totalMonthlyTax = 0
          let nextMonthlyFarmOutput = monthlyFarmOutput
          let nextMonthlyFarmValue = monthlyFarmValue
          let nextMonthlyMarketSales = monthlyMarketSales
          let lastMonthlyFarmValue = s.lastMonthlyFarmValue
          let lastMonthlyMarketSales = s.lastMonthlyMarketSales
          let lastMonthlyExpenseBreakdown = s.lastMonthlyExpenseBreakdown

          // 养民之费：每月按户口结算（宋制：约每丁2文/月），不再每帧扣除
          const yangminCost = monthlyDue ? Math.floor(population * 2) : 0

          if (monthlyDue) {
            // 三税：丁税（人头）+ 田赋（田产）+ 市税（商贸）
            const dingTax  = Math.floor(s.taxRates.ding * citizens.length)
            const tianTax  = Math.floor(monthlyFarmValue  * s.taxRates.tian)
            const shangTax = Math.floor(monthlyMarketSales * s.taxRates.shang)
            totalMonthlyTax = dingTax + tianTax + shangTax
            // 不变式：totalMonthlyTax === dingTax + tianTax + shangTax
            lastTaxBreakdown = { ding: dingTax, tian: tianTax, shang: shangTax }
            // 支出明细：养民 + 本月兴工建造（建筑+桥梁）
            const jiansheExpense = s.monthlyConstructionCost
            lastMonthlyExpenseBreakdown = {
              yangmin: yangminCost,
              jianshe: jiansheExpense,
              total: yangminCost + jiansheExpense,
            }
            lastMonthlyFarmValue    = monthlyFarmValue
            lastMonthlyMarketSales  = monthlyMarketSales
            nextMonthlyFarmOutput   = 0
            nextMonthlyFarmValue    = 0
            nextMonthlyMarketSales  = 0
            // 月末：亡者自然减少（相当于逐渐处理后事/深埋）
            for (const houseId of Object.keys(houseDead)) {
              if ((houseDead[houseId] ?? 0) > 0) houseDead[houseId]--
            }
          }

          return{
            ...s,tick:nextTick,dayTime:nextDay,dayCount,
            month:monthlyDue?s.month+1:s.month,
            // 关键修复：lastMonthlyTax 仅在月末更新，否则保留上月值（防止每帧被清零）
            lastMonthlyTax: monthlyDue ? totalMonthlyTax : s.lastMonthlyTax,
            lastTaxBreakdown,
            lastMonthlyExpenseBreakdown,
            // 月末重置本月建造累计，其余帧保留（由 placeBuilding/placeRoad 累加）
            monthlyConstructionCost: monthlyDue ? 0 : s.monthlyConstructionCost,
            money:s.money + (monthlyDue ? totalMonthlyTax - yangminCost : 0),
            buildings,citizens,houseFood,houseCrops,houseSavings,houseDead,
            farmZones:updatedFarmZones,
            farmPiles,oxCarts,marketBuyers,peddlers,
            farmInventory,granaryInventory,marketInventory,
            mineInventory,smithInventory,houseTools,
            marketConfig: s.marketConfig,
            monthlyFarmOutput:nextMonthlyFarmOutput,
            monthlyFarmValue:nextMonthlyFarmValue,
            monthlyMarketSales:nextMonthlyMarketSales,
            lastMonthlyFarmValue,lastMonthlyMarketSales,
            migrants,walkers,population,
            lastHouseholdBuyDay:s.lastHouseholdBuyDay,
            avgSatisfaction,needPressure,
          }
        })
      }, SIM_TICK_MS)
    }
    if(!state.running && interval.current!=null){window.clearInterval(interval.current);interval.current=null}
    return()=>{if(interval.current!=null)window.clearInterval(interval.current)}
  },[state.running])

  function start()  {setState(s=>({...s,running:true}))}
  function stop()   {setState(s=>({...s,running:false}))}
  function setMoney(v:number){setState(s=>({...s,money:v}))}
  function setPopulation(v:number){setState(s=>({...s,population:v}))}

  function placeBuilding(x:number,y:number,type?:BuildingType){
    const action={type:'placeBuilding',x,y,buildType:type??null,success:false,reason:''}
    try{
      setState(s=>{
        const bt=type??s.selectedBuildingType
        const ba={success:false,reason:'',buildType:bt,x,y,ts:Date.now()}
        if(!bt)                          {action.reason='no-build-type-selected';return{...s,lastBuildAttempt:{...ba,reason:action.reason}}}
        const def=BUILDING_DEFS[bt]
        if(s.money<def.cost)             {action.reason='insufficient-funds';return{...s,lastBuildAttempt:{...ba,reason:action.reason}}}
        if(isBuildingAt(s.buildings,x,y)){action.reason='tile-occupied';return{...s,lastBuildAttempt:{...ba,reason:action.reason}}}
        if(isRoadAt(s.roads,x,y))        {action.reason='road-occupied';return{...s,lastBuildAttempt:{...ba,reason:action.reason}}}
        if(isRiverAt(x,y))               {action.reason='tile-occupied';return{...s,lastBuildAttempt:{...ba,reason:action.reason}}}
        if(s.farmZones.some(z=>z.x===x&&z.y===y)){action.reason='tile-occupied';return{...s,lastBuildAttempt:{...ba,reason:action.reason}}}
        if(bt==='mine'&&!isOreVeinAt(x,y)){action.reason='no-ore-vein';return{...s,lastBuildAttempt:{...ba,reason:action.reason}}}
        const id=`${Date.now()}-${Math.floor(Math.random()*10000)}`
        const newB:Building={id,type:bt,x,y,capacity:def.capacity,occupants:0,workerSlots:def.workerSlots,cost:def.cost}
        // 新建民居给予一个月的基础口粮，避免居民刚入住就饿死
        const houseFood    = bt==='house' ? {...s.houseFood,   [id]:15}  : s.houseFood
        const houseCrops   = bt==='house' ? {...s.houseCrops,  [id]:{rice:15,millet:0,wheat:0,soybean:0,vegetable:0}} : s.houseCrops
        const houseSavings = bt==='house' ? {...s.houseSavings,[id]:50}  : s.houseSavings
        const houseTools   = bt==='house' ? {...s.houseTools,  [id]:0}   : s.houseTools
        const houseDead    = bt==='house' ? {...s.houseDead,   [id]:0}   : s.houseDead
        const marketConfig = bt==='market'? {...s.marketConfig,[id]:{...DEFAULT_MARKET_CFG}} : s.marketConfig
        action.success=true
        return{
          ...s,
          buildings:[...s.buildings,newB],
          houseFood,houseCrops,houseSavings,houseTools,houseDead,marketConfig,
          money:s.money-def.cost,
          monthlyConstructionCost: s.monthlyConstructionCost + def.cost,
          lastBuildAttempt:{...ba,success:true},
        }
      })
    }finally{try{(window as any).__LAST_ACTION__=action}catch(e){}}
  }

  function removeBuilding(id:string){
    setState(s=>{
      const bldg = s.buildings.find(b=>b.id===id)
      if (!bldg) return s

      const isHouse = bldg.type === 'house'

      // 可变副本
      const houseFood:    Record<string,number>        = { ...s.houseFood }
      const houseCrops:   Record<string,CropInventory> = Object.fromEntries(
        Object.entries(s.houseCrops).map(([k,v])=>[k,{...v}])
      )
      const houseSavings: Record<string,number>        = { ...s.houseSavings }
      const houseTools:   Record<string,number>        = { ...s.houseTools }
      const houseDead:    Record<string,number>        = { ...s.houseDead }
      const { [id]:_mc, ...marketConfig }              = s.marketConfig

      const migrants = s.migrants.filter(m=>m.targetHouseId!==id)
      const peddlers = s.peddlers.filter(p=>p.marketId!==id)

      let citizens = s.citizens.map(c=>({...c}))
      let walkers  = s.walkers
      const evictedIds = new Set<string>()

      if (isHouse) {
        // ── 民居拆除：居民就近安置，安置不了则逃离 ────────────────────────
        const displaced = s.citizens.filter(c=>c.houseId===id)
        const otherHouses = s.buildings.filter(h=>h.type==='house'&&h.id!==id)

        // 统计其他房屋当前人数
        const occByHouse = new Map<string,number>()
        for (const c of s.citizens) {
          if (c.houseId!==id) occByHouse.set(c.houseId,(occByHouse.get(c.houseId)??0)+1)
        }

        const n = displaced.length || 1
        const foodShare    = (houseFood[id]    ?? 0) / n
        const savingsShare = (houseSavings[id] ?? 0) / n
        const cropsSource  = houseCrops[id]         // 读取后再删
        let toolsToGive    = houseTools[id]   ?? 0

        for (const c of displaced) {
          // 找空位最多的房屋（贪心，优先大空间）
          const found = otherHouses
            .filter(h=>(occByHouse.get(h.id)??0) < h.capacity)
            .sort((a,z)=>{
              const va = a.capacity-(occByHouse.get(a.id)??0)
              const vz = z.capacity-(occByHouse.get(z.id)??0)
              return vz-va
            })[0] ?? null

          if (found) {
            const idx = citizens.findIndex(x=>x.id===c.id)
            if (idx>=0) citizens[idx] = { ...citizens[idx], houseId: found.id }
            occByHouse.set(found.id,(occByHouse.get(found.id)??0)+1)

            // 按比例分配粮食/积蓄到新家
            houseFood[found.id]    = clampFood((houseFood[found.id]??0)+foodShare)
            houseSavings[found.id] = (houseSavings[found.id]??0)+savingsShare
            if (cropsSource) {
              const hc = houseCrops[found.id] ?? createEmptyInventory()
              for (const k of CROP_KEYS) hc[k] = clampCrop(hc[k]+(cropsSource[k]/n))
              houseCrops[found.id] = hc
            }
            // 农具转移到第一个安置户
            if (toolsToGive>0) {
              houseTools[found.id] = (houseTools[found.id]??0)+toolsToGive
              toolsToGive = 0
            }
          } else {
            evictedIds.add(c.id)   // 无处可去 → 逃离
          }
        }

        citizens = citizens.filter(c=>!evictedIds.has(c.id))
        walkers  = walkers.filter(w=>!evictedIds.has(w.citizenId))

      } else {
        // ── 功能性建筑拆除：工作人员就地解散回家待业 ──────────────────────
        const workerIds = new Set(s.citizens.filter(c=>c.workplaceId===id).map(c=>c.id))
        citizens = citizens.map(c=>
          c.workplaceId===id
            ? { ...c, workplaceId:null, profession:null, isAtHome:true }
            : c
        )
        // 取消仍在途中（前往工作地）的行走任务
        walkers = walkers.filter(w=>!(workerIds.has(w.citizenId)&&w.purpose==='toWork'))
      }

      // 清除已拆建筑的存档数据
      delete houseFood[id]; delete houseCrops[id]
      delete houseSavings[id]; delete houseTools[id]; delete houseDead[id]

      return{
        ...s,
        buildings:  s.buildings.filter(b=>b.id!==id),
        citizens, migrants, walkers, peddlers,
        houseFood, houseCrops, houseSavings, houseTools, houseDead, marketConfig,
        population: citizens.length,
        selectedBuildingId: null,
        selectedCitizenId:
          s.selectedCitizenId && !citizens.some(c=>c.id===s.selectedCitizenId)
            ? null : s.selectedCitizenId,
      }
    })
  }
  function selectBuildingType(t:BuildingType|null){setState(s=>({...s,selectedBuildingType:t}))}
  function selectBuilding(id:string|null){setState(s=>({...s,selectedBuildingId:id,selectedCitizenId:id?null:s.selectedCitizenId,selectedFarmZoneId:id?null:s.selectedFarmZoneId}))}
  function selectCitizen(id:string|null){setState(s=>({...s,selectedCitizenId:id,selectedBuildingId:id?null:s.selectedBuildingId,selectedFarmZoneId:id?null:s.selectedFarmZoneId}))}
  function selectFarmZone(id:string|null){setState(s=>({...s,selectedFarmZoneId:id,selectedBuildingId:id?null:s.selectedBuildingId,selectedCitizenId:id?null:s.selectedCitizenId}))}
  function setTaxRates(rates:{ding:number;tian:number;shang:number}){setState(s=>({...s,taxRates:rates}))}
  function setMarketConfig(id:string,cfg:MarketConfig){
    setState(s=>({...s,marketConfig:{...s.marketConfig,[id]:cfg}}))
  }
  function setFarmCrop(id:string,crop:CropType){
    setState(s=>({...s,farmZones:s.farmZones.map(z=>{
      if(z.id!==id) return z
      // 若当前周期尚未开始（growthProgress===0），立即切换；否则排队到下个周期
      if(z.growthProgress===0) return {...z,cropType:crop,pendingCropType:undefined}
      return {...z,pendingCropType:crop}
    })}))}
  function placeRoad(x:number,y:number){
    setState(s=>{
      if(isRoadAt(s.roads,x,y)||isBuildingAt(s.buildings,x,y)) return s
      if(tileInFarmZone(s.farmZones,x,y)) return s   // 农田不能铺路
      if(isRiverAt(x,y)){
        const span=getBridgeSpan(s.roads,x,y)
        const cost=BRIDGE_BASE_COST*span
        if(s.money<cost) return s  // 资金不足，无法建桥
        return{
          ...s,
          roads:[...s.roads,{x,y}],
          money:s.money-cost,
          monthlyConstructionCost: s.monthlyConstructionCost + cost,
        }
      }
      return{...s,roads:[...s.roads,{x,y}]}
    })
  }
  function removeRoad(x:number,y:number){setState(s=>({...s,roads:s.roads.filter(r=>!(r.x===x&&r.y===y))}))}
  function placeFarmZone(x:number,y:number){
    setState(s=>{
      // 检查 2×2 地块每格是否为空地
      const footprint=[{x,y},{x:x+1,y},{x,y:y+1},{x:x+1,y:y+1}]
      for(const t of footprint){
        if(isRiverAt(t.x,t.y)) return s               // 水面不能建农田
        if(isMountainAt(t.x,t.y)) return s             // 山地不能建农田
        if(isBuildingAt(s.buildings,t.x,t.y)) return s
        if(isRoadAt(s.roads,t.x,t.y)) return s
        if(tileInFarmZone(s.farmZones,t.x,t.y)) return s
      }
      // 农田必须在河流五步之内（切比雪夫距离 ≤ 5）
      const nearRiver = footprint.some(t => isNearRiverFive(t.x, t.y))
      if (!nearRiver) return s
      // 自动选作物：靠近河流种水稻，其余按地形
      const nearRiverAdj=footprint.some(t=>isNearRiver(t.x,t.y))
      const cropType:CropType=nearRiverAdj?'rice':cropForTile(x,y)
      const id=`fz-${Date.now()}-${Math.floor(Math.random()*10000)}`
      return{...s,farmZones:[...s.farmZones,{id,x,y,cropType,growthProgress:0}]}
    })
  }
  function removeFarmZone(x:number,y:number){
    setState(s=>{
      const zone=farmZoneAt(s.farmZones,x,y)
      if(!zone) return s
      // 农夫就地解散回家待业
      const farmerIds = new Set(s.citizens.filter(c=>c.farmZoneId===zone.id).map(c=>c.id))
      const citizens = s.citizens.map(c=>
        c.farmZoneId===zone.id
          ? { ...c, farmZoneId:null, profession:null, isAtHome:true }
          : c
      )
      // 取消仍在途中（前往农田）的行走任务
      const walkers = s.walkers.filter(w=>!(farmerIds.has(w.citizenId)&&w.purpose==='toWork'))
      return{
        ...s,
        farmZones:s.farmZones.filter(z=>z.id!==zone.id),
        citizens,
        walkers,
        selectedFarmZoneId:s.selectedFarmZoneId===zone.id?null:s.selectedFarmZoneId,
      }
    })
  }  function selectTool(t:Tool){
    const isBT=ALL_BUILDING_TYPES.includes(t as BuildingType)
    setState(s=>({
      ...s,
      selectedTool:t,
      selectedBuildingType:isBT?(t as BuildingType):null,
      selectedBuildingId: t === 'pan' ? s.selectedBuildingId : null,
      selectedCitizenId: t === 'pan' ? s.selectedCitizenId : null,
      selectedFarmZoneId: t === 'pan' ? s.selectedFarmZoneId : null,
    }))
  }

  try{if(typeof window!=='undefined')(window as any).__CITY_STATE__=state}catch(e){}

  useLayoutEffect(()=>{
    try{
      ;(window as any).__CITY_STATE__=state
      ;(window as any).__GET_CITY_STATE__=()=>state
      ;(window as any).__LAST_ACTION__=(window as any).__LAST_ACTION__||null
      ;(window as any).__TEST_API__={
        placeBuilding:(x:number,y:number)=>{placeBuilding(x,y);return(window as any).__LAST_ACTION__},
        placeRoad:(x:number,y:number)=>{placeRoad(x,y);return true},
        placeFarmZone:(x:number,y:number)=>{placeFarmZone(x,y);return true},
        selectTool:(t:Tool)=>{selectTool(t);return true},
        setMoney:(v:number)=>{setMoney(v);return true},
        setDayTime:(v:number)=>{setState(s=>({...s,dayTime:Math.max(0,Math.min(0.999,v))}));return true},
        setHouseFood:(houseId:string,v:number)=>{setState(s=>({...s,houseFood:{...s.houseFood,[houseId]:v}}));return true},
        selectBuilding:(id:string|null)=>{selectBuilding(id);return true},
        selectCitizen:(id:string|null)=>{selectCitizen(id);return true},
        applyToolAt:(x:number,y:number,tool?:Tool)=>{
          const at=tool??state.selectedTool
          if(ALL_BUILDING_TYPES.includes(at as BuildingType)){
            const bt=at as BuildingType
            const action={type:'placeBuilding',x,y,buildType:bt,success:false,reason:''}
            setState(s=>{
              const def=BUILDING_DEFS[bt]
              if(s.money<def.cost||isBuildingAt(s.buildings,x,y)||isRoadAt(s.roads,x,y)||s.farmZones.some(z=>z.x===x&&z.y===y))return s
              const id=`${Date.now()}-${Math.floor(Math.random()*10000)}`
              const houseFood = bt==='house' ? {...s.houseFood,[id]:15} : s.houseFood
              action.success=true
              return{...s,buildings:[...s.buildings,{id,type:bt,x,y,capacity:def.capacity,occupants:0,workerSlots:def.workerSlots,cost:def.cost}],houseFood,money:s.money-def.cost,monthlyConstructionCost:s.monthlyConstructionCost+def.cost}
            })
            try{(window as any).__LAST_ACTION__=action}catch(e){}
            return action
          }
          if(at==='road'){
            setState(s=>{
              if(isRoadAt(s.roads,x,y)||isBuildingAt(s.buildings,x,y)||tileInFarmZone(s.farmZones,x,y))return s
              if(isRiverAt(x,y)){
                const span=getBridgeSpan(s.roads,x,y)
                const cost=BRIDGE_BASE_COST*span
                if(s.money<cost)return s
                return{...s,roads:[...s.roads,{x,y}],money:s.money-cost,monthlyConstructionCost:s.monthlyConstructionCost+cost}
              }
              return{...s,roads:[...s.roads,{x,y}]}
            })
            return true
          }
          if(at==='farmZone'){
            placeFarmZone(x,y)
            return true
          }
          if(at==='bulldoze'){
            const snapshot = state  // read current state for lookup
            const b = snapshot.buildings.find(v=>v.x===x&&v.y===y)
            if(b){ removeBuilding(b.id); return true }
            if(snapshot.roads.some(r=>r.x===x&&r.y===y)){ removeRoad(x,y); return true }
            if(farmZoneAt(snapshot.farmZones,x,y)){ removeFarmZone(x,y); return true }
            return true
          }
          return true
        },
        getState:()=>state,
      }
    }catch(e){}
  },[state])

  return(
    <SimulationContext.Provider value={{state,start,stop,setMoney,setPopulation,placeBuilding,removeBuilding,selectBuildingType,placeRoad,removeRoad,placeFarmZone,removeFarmZone,selectFarmZone,setFarmCrop,setTaxRates,setMarketConfig,selectTool,selectBuilding,selectCitizen}}>
      {children}
    </SimulationContext.Provider>
  )
}

export function useSimulation(){return useContext(SimulationContext)}

