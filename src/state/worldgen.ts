/**
 * 世界地形生成
 * Perlin fBm 高度图驱动河流、山脉、矿脉的统一生成流程。
 */
import worldGenConfig from '../config/world-gen'
import type { RiverTile } from './types'

export const MAP_SIZE_X = worldGenConfig.mapSizeX
export const MAP_SIZE_Y = worldGenConfig.mapSizeY

// ─── Local helpers (not exported) ─────────────────────────────────────────
function clamp01(v: number) { return Math.max(0, Math.min(1, v)) }

function createRng(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function buildPermTable(seed: number): Uint8Array {
  const rand = createRng(seed)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp
  }
  return p
}

function perlin2(x: number, y: number, p: Uint8Array): number {
  const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255
  const xf = x - Math.floor(x), yf = y - Math.floor(y)
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const u = fade(xf), v = fade(yf)
  const grad = (h: number, dx: number, dy: number) => {
    switch (h & 3) {
      case 0: return dx + dy; case 1: return -dx + dy
      case 2: return dx - dy; default: return -dx - dy
    }
  }
  const aa = p[(p[xi] + yi) & 255], ab = p[(p[xi] + yi + 1) & 255]
  const ba = p[(p[xi + 1] + yi) & 255], bb = p[(p[xi + 1] + yi + 1) & 255]
  return (1 - v) * ((1 - u) * grad(aa, xf, yf)     + u * grad(ba, xf - 1, yf))
       +      v  * ((1 - u) * grad(ab, xf, yf - 1)  + u * grad(bb, xf - 1, yf - 1))
}

function fbm(x: number, y: number, p: Uint8Array, oct = 6, lac = 2.0, gain = 0.5): number {
  let v = 0, a = 1.0, f = 1.0, mx = 0
  for (let i = 0; i < oct; i++) { v += perlin2(x * f, y * f, p) * a; mx += a; a *= gain; f *= lac }
  return v / mx + 0.5
}

function ridgedFbm(x: number, y: number, p: Uint8Array, oct = 5, lac = 2.0, gain = 0.5): number {
  let v = 0, a = 1.0, f = 1.0, mx = 0
  for (let i = 0; i < oct; i++) {
    const n = perlin2(x * f, y * f, p)
    const r = 1 - Math.abs(n)
    v += r * a; mx += a; a *= gain; f *= lac
  }
  return Math.max(0, Math.min(1, v / mx))
}

// ─── World seed ───────────────────────────────────────────────────────────
const _seedParam = (typeof window !== 'undefined') ? (() => {
  try { const p = new URLSearchParams(window.location.search).get('seed'); return p ? Number(p) : null } catch { return null }
})() : null
export const WORLD_SEED = (_seedParam && Number.isFinite(_seedParam))
  ? Math.floor(_seedParam)
  : Math.floor(Math.random() * 1_000_000_000)
if (typeof window !== 'undefined') try { (window as any).__WORLD_SEED__ = WORLD_SEED } catch { /* ignore */ }

// ─── Unified world generation ──────────────────────────────────────────────
const {
  riverTiles:        _RIVER_TILES,
  riverCenterLine:   _RIVER_CENTER_LINE,
  mountainTiles:     _MOUNTAIN_TILES,
  mountainHeightMap: MOUNTAIN_HEIGHT_MAP,
  oreVeinTiles:      _ORE_VEIN_TILES,
  forestTiles:       _FOREST_TILES,
  grasslandTiles:    _GRASSLAND_TILES,
  mountainForestTiles: _MOUNTAIN_FOREST_TILES,
  riverTribChains:   _RIVER_TRIB_CHAINS,
} = (() => {
  const perm    = buildPermTable(WORLD_SEED)
  const oreRand = createRng(WORLD_SEED ^ 0xdeadbeef)

  const W = MAP_SIZE_X, H = MAP_SIZE_Y
  const minX = -Math.floor(W / 2), maxX = Math.floor(W / 2) - 1
  const minY = -Math.floor(H / 2), maxY = Math.floor(H / 2) - 1
  const N = W * H

  const hArr     = new Float32Array(N)
  const cityMask = new Uint8Array(N)
  const toI  = (x: number, y: number) => (y - minY) * W + (x - minX)
  const atH  = (x: number, y: number) => hArr[toI(x, y)]
  const setH = (x: number, y: number, v: number) => { hArr[toI(x, y)] = Math.max(0, Math.min(1, v)) }

  for (let ix = minX; ix <= maxX; ix++) {
    for (let iy = minY; iy <= maxY; iy++) {
      const fx = (ix - minX) / W * 3.0
      const fy = (iy - minY) / H * 2.5
      const large = perlin2(fx * 0.18, fy * 0.18, perm) * 0.6 + 0.4
      const base  = fbm(fx * 0.7, fy * 0.7, perm, 5, 2.0, 0.55) * 0.45
      const ridge = ridgedFbm(fx * 1.5, fy * 1.5, perm, 7, 2.0, 0.55) * 1.5
      const maxDist = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2) / 2
      const nd = Math.sqrt(ix * ix + iy * iy) / (maxDist || 1)
      const radial = Math.max(0, Math.min(1, (nd - 0.18) / 0.82))
      let h = clamp01(base * (0.7 - radial * 0.4) + ridge * (0.6 + radial * 0.8) + large * 0.12)

      const cx = ix, cy = iy
      const cm = worldGenConfig.city
      let inMask = false
      if (cm.shape === 'circle') {
        inMask = Math.sqrt(cx*cx + cy*cy) <= cm.flatOuter
      } else if (cm.shape === 'ellipse') {
        const rx = cm.flatOuter * 1.2, ry = cm.flatOuter
        inMask = (cx*cx)/(rx*rx) + (cy*cy)/(ry*ry) <= 1
      } else if (cm.shape === 'rect') {
        inMask = Math.abs(cx) <= cm.flatOuter && Math.abs(cy) <= cm.flatOuter
      } else {
        const fxn = (cx - minX) / W, fyn = (cy - minY) / H
        const noise = perlin2(fxn / (cm.blobFreq || 0.05), fyn / (cm.blobFreq || 0.05), perm) * 0.5 + 0.5
        const maxD = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2) / 2
        const radialFactor = 1 - (cm.radialK || 0.9) * Math.max(0, Math.min(1, Math.sqrt(cx*cx + cy*cy) / (maxD || 1)))
        const mixed = noise * (cm.noiseWeight || 0.7) + radialFactor * (1 - (cm.noiseWeight || 0.7))
        inMask = mixed > (cm.blobThreshold || 0.42)
      }
      if (inMask) { h *= 0.02; cityMask[toI(ix, iy)] = 1 }
      h = clamp01(h * (worldGenConfig.mountain.amplify || 1.6))
      setH(ix, iy, h)
    }
  }

  // Post-process: smooth city mask boundary
  ;(() => {
    const inner    = worldGenConfig.city.flatInner  || 12
    const outer    = worldGenConfig.city.flatOuter  || 28
    const smoothR  = worldGenConfig.city.smoothRadius || Math.max(1, Math.floor((outer - inner) / 2))
    const area     = (2 * smoothR + 1) * (2 * smoothR + 1)
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iy = minY; iy <= maxY; iy++) {
        const idx = toI(ix, iy)
        const h0  = atH(ix, iy)
        if (cityMask[idx]) { setH(ix, iy, h0 * 0.02); continue }
        let sum = 0
        for (let dx = -smoothR; dx <= smoothR; dx++) for (let dy = -smoothR; dy <= smoothR; dy++) {
          const nx = ix + dx, ny = iy + dy
          if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue
          sum += cityMask[toI(nx, ny)]
        }
        const frac = Math.max(0, Math.min(1, sum / area))
        if (frac > 0) setH(ix, iy, h0 * (1 - frac * 0.98))
      }
    }
  })()

  // ── 2. River via Dijkstra on heightmap (left → right) ─────────────────
  const DIRS8: [number, number][] = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]

  const dirIdx = new Int8Array(N).fill(-1)
  for (let iy = minY; iy <= maxY; iy++) {
    for (let ix = minX; ix <= maxX; ix++) {
      const curH = atH(ix, iy)
      let bestDrop = 0, best = -1
      for (let di = 0; di < DIRS8.length; di++) {
        const nx = ix + DIRS8[di][0], ny = iy + DIRS8[di][1]
        if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue
        const drop = curH - atH(nx, ny)
        if (drop > bestDrop) { bestDrop = drop; best = di }
      }
      dirIdx[toI(ix, iy)] = best
    }
  }

  const acc = new Float32Array(N).fill(1)
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) =>
    atH((b % W) + minX, Math.floor(b / W) + minY) - atH((a % W) + minX, Math.floor(a / W) + minY))
  for (const i of order) {
    const d = dirIdx[i]; if (d < 0) continue
    const ix = (i % W) + minX, iy = Math.floor(i / W) + minY
    acc[toI(ix + DIRS8[d][0], iy + DIRS8[d][1])] += acc[i]
  }

  const dist = new Float32Array(N).fill(Infinity)
  const prev = new Int32Array(N).fill(-1)
  const seen = new Uint8Array(N)
  class Heap {
    data: number[] = []
    push(v: number) { this.data.push(v); this._up(this.data.length - 1) }
    pop(): number | undefined {
      if (!this.data.length) return undefined
      const r = this.data[0]; const last = this.data.pop()!
      if (this.data.length) { this.data[0] = last; this._dn(0) }
      return r
    }
    _up(i: number) { while (i > 0) { const p = (i - 1) >> 1; if (dist[this.data[p]] <= dist[this.data[i]]) break; [this.data[p], this.data[i]] = [this.data[i], this.data[p]]; i = p } }
    _dn(i: number) { const n = this.data.length; for (;;) { let l = i*2+1, r = l+1, m = i; if (l<n && dist[this.data[l]]<dist[this.data[m]]) m=l; if (r<n && dist[this.data[r]]<dist[this.data[m]]) m=r; if (m===i) break; [this.data[m],this.data[i]]=[this.data[i],this.data[m]]; i=m } }
  }
  const heap = new Heap()
  for (let y = minY; y <= maxY; y++) {
    const i = toI(minX, y)
    dist[i] = Math.max(0, atH(minX, y))
    heap.push(i)
  }
  let targetIndex = -1
  while (true) {
    const cur = heap.pop(); if (cur === undefined) break
    if (seen[cur]) continue; seen[cur] = 1
    const ux = (cur % W) + minX, uy = Math.floor(cur / W) + minY
    if (ux === maxX) { targetIndex = cur; break }
    for (const [dx, dy] of DIRS8) {
      const nx = ux + dx, ny = uy + dy
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue
      const vi = toI(nx, ny); if (seen[vi]) continue
      const nd = dist[cur] + Math.max(0, atH(nx, ny)) + 0.01
      if (nd < dist[vi]) { dist[vi] = nd; prev[vi] = cur; heap.push(vi) }
    }
  }

  const riverSet = new Set<string>()
  const riverTiles: RiverTile[] = []
  if (targetIndex >= 0) {
    let cur = targetIndex
    const rev: { x: number; y: number }[] = []
    while (cur >= 0) {
      rev.push({ x: (cur % W) + minX, y: Math.floor(cur / W) + minY })
      if (prev[cur] === -1) break
      cur = prev[cur]
    }
    rev.reverse()
    const perX = new Map<number, number[]>()
    for (const p of rev) { if (!perX.has(p.x)) perX.set(p.x, []); perX.get(p.x)!.push(p.y) }
    const xs = Array.from(perX.keys()).sort((a, b) => a - b)
    const pts = xs.map(x => { const ys = perX.get(x)!; const avg = ys.reduce((s, v) => s + v, 0) / ys.length; return { x, y: avg } })
    const smoothed = pts.map((pt, i) => ({ x: pt.x, y: (pts[i-1]?.y ?? pt.y) * 0.25 + pt.y * 0.5 + (pts[i+1]?.y ?? pt.y) * 0.25 }))
    for (const p of smoothed) { const iy = Math.round(p.y); riverTiles.push({ x: p.x, y: iy }); riverSet.add(`${p.x},${iy}`) }
  }

  // ── Main river fallback ───────────────────────────────────────────────────
  if (riverTiles.length < Math.max(6, Math.floor((maxX - minX + 1) * 0.3))) {
    riverTiles.length = 0; riverSet.clear()
    for (let ix = minX; ix <= maxX; ix++) {
      let bestY = minY, bestVal = Infinity
      for (let iy = minY; iy <= maxY; iy++) { const v = atH(ix, iy); if (v < bestVal) { bestVal = v; bestY = iy } }
      riverTiles.push({ x: ix, y: bestY }); riverSet.add(`${ix},${bestY}`)
    }
  }

  // ── 2.5: River centre-line (from main river only, before tributaries) ─────
  const colMap = new Map<number, number[]>()
  for (const t of riverTiles) { if (!colMap.has(t.x)) colMap.set(t.x, []); colMap.get(t.x)!.push(t.y) }
  let riverCenterLine = Array.from(colMap.keys()).sort((a, b) => a - b).map(x => {
    const ys = colMap.get(x)!
    let bestY = ys[0], bestH = atH(x, bestY)
    for (const y of ys) { const hv = atH(x, y); if (hv < bestH) { bestH = hv; bestY = y } }
    return { x, y: bestY }
  })
  const minAcceptLen = Math.max(Math.floor((maxX - minX + 1) * 0.5), 6)
  if (riverCenterLine.length < minAcceptLen) {
    riverCenterLine = []
    for (let ix = minX; ix <= maxX; ix++) {
      let bestY = minY, bestVal = Infinity
      for (let iy = minY; iy <= maxY; iy++) { const hv = atH(ix, iy); if (hv < bestVal) { bestVal = hv; bestY = iy } }
      riverCenterLine.push({ x: ix, y: bestY })
    }
  }

  // ── 3: Tributary chains (Dijkstra W→E, parallel to main river) ───────────
  // Each tributary starts from the west edge at a Y-offset from the main river,
  // flows generally eastward (W→E bias) following the lowest-cost terrain path,
  // and ends either at the east edge or where it naturally merges with the main river.
  const rcfg = worldGenConfig.river || {}
  const protectRadiusFromCity = (worldGenConfig.city?.flatOuter || 0) + (worldGenConfig.city?.protectPadding || 0)
  const finalProtectRadius = Math.max((rcfg.protectRadius) || 28, protectRadiusFromCity)
  // Main river entry Y at leftmost column of centre-line
  const mainEntryY = riverCenterLine[0]?.y ?? 0
  // Up to 3 well-separated tributaries.
  // Offsets are ordered so within each side the CLOSEST trib to the main river comes first.
  // Each trib is constrained to its side — no crossing the main river, no tangling with
  // earlier tribs on the same side.
  const tribYOffsets = [-22, 18, -42, 34, -58, 48].filter(off => {
    const ty = Math.round(mainEntryY + off)
    return ty >= minY + 8 && ty <= maxY - 8
  }).slice(0, 3)
  // Local min-heap factory (each tributary needs its own distance array)
  const makeH = (d: Float32Array) => {
    const h: number[] = []
    const up = (i: number) => { while(i>0){const p=(i-1)>>1; if(d[h[p]]<=d[h[i]])break;[h[p],h[i]]=[h[i],h[p]];i=p} }
    const dn = (i: number) => { const n=h.length; for(;;){let l=i*2+1,r=l+1,m=i; if(l<n&&d[h[l]]<d[h[m]])m=l; if(r<n&&d[h[r]]<d[h[m]])m=r; if(m===i)break;[h[m],h[i]]=[h[i],h[m]];i=m} }
    return { push: (v: number) => { h.push(v); up(h.length-1) }, pop: (): number|undefined => { if(!h.length)return undefined; const r=h[0]; const last=h.pop()!; if(h.length){h[0]=last;dn(0)} return r } }
  }
  const TRIB_EAST_BIAS = 0.06
  const TRIB_WEST_PEN  = 0.40
  const TRIB_MIN_LEN = Math.max(40, Math.floor((maxX - minX + 1) * 0.25))
  const mainRiverYatX = new Map(riverCenterLine.map(p => [p.x, p.y]))
  const TRIB_REPEL_R    = 4
  const TRIB_REPEL_COST = 0.9
  const riverTribChains: { x: number; y: number }[][] = []
  const riverTribSides:   number[]                    = []  // +1 = above main river, -1 = below

  for (const yOff of tribYOffsets) {
    const startY = Math.round(mainEntryY + yOff)
    if (startY < minY || startY > maxY) continue

    // Which side of the main river this trib is on (-1 = below, +1 = above)
    const tribSide = yOff < 0 ? -1 : 1

    // Inner-trib lane boundary: collect the Y positions of every already-generated trib
    // on the SAME side that is CLOSER to the main river. The current trib must stay
    // outside (farther from main river) of those lanes before the join zone.
    const innerBoundAtX = new Map<number, number>()
    for (let pi = 0; pi < riverTribChains.length; pi++) {
      if (riverTribSides[pi] !== tribSide) continue  // different side
      // Earlier entries have smaller |yOff|, so they are closer to the main river.
      // Every earlier same-side trib is an inner lane that we must not cross.
      for (const p of riverTribChains[pi]) {
        const ex = innerBoundAtX.get(p.x) ?? null
        // For a below-trib: keep the MAX inner-bound Y (closest from below = most positive)
        // For an above-trib: keep the MIN inner-bound Y (closest from above = most negative)
        innerBoundAtX.set(p.x, ex === null ? p.y
          : (tribSide < 0 ? Math.max(ex, p.y) : Math.min(ex, p.y)))
      }
    }

    const td = new Float32Array(N).fill(Infinity)
    const tp = new Int32Array(N).fill(-1)
    const ts = new Uint8Array(N)
    const th = makeH(td)
    for (let dyi = -2; dyi <= 2; dyi++) {
      const sy = startY + dyi; if (sy < minY || sy > maxY) continue
      const si = toI(minX, sy); td[si] = Math.max(0, atH(minX, sy)); th.push(si)
    }
    let tgt = -1
    for (;;) {
      const cur = th.pop(); if (cur === undefined) break
      if (ts[cur]) continue; ts[cur] = 1
      const ux = (cur % W) + minX, uy = Math.floor(cur / W) + minY
      if (ux === maxX || (riverSet.has(`${ux},${uy}`) && ux >= minX + TRIB_MIN_LEN)) { tgt = cur; break }
      for (const [ddx, ddy] of DIRS8) {
        const nx = ux + ddx, ny = uy + ddy
        if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue
        const vi = toI(nx, ny); if (ts[vi]) continue
        const dirCost   = ddx < 0 ? TRIB_WEST_PEN : (ddx === 0 ? TRIB_EAST_BIAS : 0)
        const protCost  = Math.hypot(nx, ny) < finalProtectRadius ? 2.5 : 0
        const mainYhere = mainRiverYatX.get(nx) ?? null

        // Before the join zone: apply repulsion + hard crossing barriers.
        // After the join zone: all off — the trib can now approach and merge cleanly
        // at a single point instead of running parallel for many extra columns.
        const isJoinZone = nx >= minX + TRIB_MIN_LEN

        // Repulsion: keeps trib away from the main-river valley so it finds its own path
        const repelCost = (!isJoinZone && mainYhere !== null)
          ? Math.max(0, TRIB_REPEL_R - Math.abs(ny - mainYhere)) * TRIB_REPEL_COST
          : 0

        // Hard barrier: trib must not cross to the wrong side of the main river
        const crossMainCost = (!isJoinZone && mainYhere !== null)
          ? (tribSide < 0 ? (ny >= mainYhere ? 100.0 : 0)
                          : (ny <= mainYhere ? 100.0 : 0))
          : 0

        // Hard barrier: trib must not cross an inner (closer-to-river) trib on same side
        const innerBound    = innerBoundAtX.get(nx) ?? null
        const crossTribCost = (!isJoinZone && innerBound !== null)
          ? (tribSide < 0 ? (ny >= innerBound ? 80.0 : 0)
                          : (ny <= innerBound ? 80.0 : 0))
          : 0

        const nd = td[cur] + Math.max(0, atH(nx, ny)) + 0.01
                 + dirCost + protCost + repelCost + crossMainCost + crossTribCost
        if (nd < td[vi]) { td[vi] = nd; tp[vi] = cur; th.push(vi) }
      }
    }
    if (tgt < 0) continue
    const tgtX = (tgt % W) + minX
    const trev: { x: number; y: number }[] = []
    let c = tgt
    while (c >= 0) {
      trev.push({ x: (c % W) + minX, y: Math.floor(c / W) + minY })
      if (tp[c] === -1) break; c = tp[c]
    }
    trev.reverse()
    const tColMap = new Map<number, number[]>()
    for (const p of trev) {
      if (p.x > tgtX) continue
      if (!tColMap.has(p.x)) tColMap.set(p.x, [])
      tColMap.get(p.x)!.push(p.y)
    }
    const tChain = Array.from(tColMap.keys()).sort((a, b) => a - b).map(x => {
      const ys = tColMap.get(x)!
      const avg = ys.reduce((s, v) => s + v, 0) / ys.length
      return { x, y: Math.round(avg) }
    })
    if (tChain.length < TRIB_MIN_LEN) continue
    // Clamp every chain point to its correct side of the main river.
    // Points that briefly crossed (via diagonal moves near the junction, when barriers
    // were relaxed) are snapped to the main-river Y rather than removed, so the chain
    // has no gaps and the ribbon ends cleanly AT the junction line.
    const clampedChain = tChain.map(p => {
      const mY = mainRiverYatX.get(p.x) ?? mainEntryY
      return { x: p.x, y: tribSide < 0 ? Math.min(p.y, mY) : Math.max(p.y, mY) }
    })
    if (clampedChain.length < TRIB_MIN_LEN) continue
    riverTribChains.push(clampedChain)
    riverTribSides.push(tribSide)
    for (const p of clampedChain) {
      const k = `${p.x},${p.y}`
      if (!riverSet.has(k)) { riverSet.add(k); riverTiles.push({ x: p.x, y: p.y }) }
    }
  }

  // Widen river
  const addR = (x: number, y: number) => {
    if (x < minX || x > maxX || y < minY || y > maxY) return
    const k = `${x},${y}`; if (!riverSet.has(k)) { riverSet.add(k); riverTiles.push({ x, y }) }
  }
  for (const rt of [...riverTiles]) {
    let bestN: { x: number; y: number; h: number } | null = null
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
      const nx = rt.x+dx, ny = rt.y+dy
      if (nx<minX||nx>maxX||ny<minY||ny>maxY) continue
      const h = atH(nx, ny); if (!bestN || h < bestN.h) bestN = { x: nx, y: ny, h }
    }
    if (bestN) addR(bestN.x, bestN.y)
  }

  // Carve valley
  const CARVE_R = 8, CARVE_D = 0.45
  for (const s of riverSet) {
    const [rx, ry] = s.split(',').map(Number)
    for (let dx = -CARVE_R; dx <= CARVE_R; dx++) for (let dy = -CARVE_R; dy <= CARVE_R; dy++) {
      const d = Math.sqrt(dx*dx+dy*dy); if (d > CARVE_R) continue
      const x = rx+dx, y = ry+dy
      if (x<minX||x>maxX||y<minY||y>maxY) continue
      const f = 1 - d/CARVE_R
      setH(x, y, riverSet.has(`${x},${y}`) ? 0 : atH(x,y) - CARVE_D*f*f)
    }
  }

  // ── 4. Mountains ──────────────────────────────────────────────────────────
  const MTHRESH = worldGenConfig.mountain.threshold ?? 0.56
  const mountainTiles: { x: number; y: number }[] = []
  const mountainHeightMap = new Map<string, number>()
  for (let ix = minX; ix <= maxX; ix++) for (let iy = minY; iy <= maxY; iy++) {
    const key = `${ix},${iy}`
    if (riverSet.has(key)) continue
    const h = atH(ix, iy)
    if (h >= MTHRESH) { mountainTiles.push({ x: ix, y: iy }); mountainHeightMap.set(key, (h - MTHRESH) / (1 - MTHRESH)) }
  }


  // ── Highway corridor: keep mountains away from the entry road ─────────────
  const DIR4 = [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]
  const hwCandidate: { x: number; y: number }[] = (() => {
    function inBounds(x: number, y: number) { return x>=minX&&x<=maxX&&y>=minY&&y<=maxY }
    function bfsAvoid(start: { x: number; y: number }, goal: { x: number; y: number }) {
      const q = [start], parent = new Map<string, string|null>()
      parent.set(`${start.x},${start.y}`, null)
      while (q.length > 0) {
        const p = q.shift()!; if (p.x===goal.x&&p.y===goal.y) break
        for (const [dx, dy] of DIR4) {
          const nx = p.x+dx, ny = p.y+dy; if (!inBounds(nx,ny)) continue
          const k = `${nx},${ny}`; if (parent.has(k)||riverSet.has(k)) continue
          parent.set(k, `${p.x},${p.y}`); q.push({ x: nx, y: ny })
        }
      }
      const gk = `${goal.x},${goal.y}`; if (!parent.has(gk)) return null
      const rev: { x: number; y: number }[] = []; let cur: string|null = gk
      while (cur) { const [sx,sy]=cur.split(',').map(Number); rev.push({x:sx,y:sy}); cur=parent.get(cur)??null }
      return rev.reverse()
    }
    for (let dx = 0; dx < 8; dx++) {
      const x = minX+dx
      const cands = Array.from({length:maxY-minY+1},(_,i)=>({x,y:minY+i}))
        .filter(p=>!riverSet.has(`${p.x},${p.y}`))
        .sort((a,b)=>Math.abs(a.y)-Math.abs(b.y))
      for (const s of cands) { const path = bfsAvoid(s,{x:0,y:0}); if (path?.length) return path }
    }
    return []
  })()
  const HW_BUFFER = 2
  const HIGHWAY_KEYS = new Set<string>()
  for (const p of hwCandidate) for (let dx=-HW_BUFFER;dx<=HW_BUFFER;dx++) for (let dy=-HW_BUFFER;dy<=HW_BUFFER;dy++) HIGHWAY_KEYS.add(`${p.x+dx},${p.y+dy}`)
  if (HIGHWAY_KEYS.size > 0) {
    const kept: { x: number; y: number }[] = []
    for (const t of mountainTiles) { const k = `${t.x},${t.y}`; if (!HIGHWAY_KEYS.has(k)) kept.push(t); else mountainHeightMap.delete(k) }
    mountainTiles.length = 0; mountainTiles.push(...kept)
  }

  // ── 6. Ore veins ─────────────────────────────────────────────────────────
  const mKeys   = new Set(mountainTiles.map(t => `${t.x},${t.y}`))
  const oreSet  = new Set<string>()
  const oreCfg  = worldGenConfig.ore
  const VEIN_R  = oreCfg.veinRadius
  const FILL_P  = oreCfg.veinFill

  // Mountain-core veins (fixed count, deep in the mountains)
  const numVeins = oreCfg.mountainVeins
  for (let v = 0; v < numVeins && mountainTiles.length > 0; v++) {
    const c = mountainTiles[Math.floor(oreRand() * mountainTiles.length)]
    for (let dx = -VEIN_R; dx <= VEIN_R; dx++) for (let dy = -VEIN_R; dy <= VEIN_R; dy++) {
      if (dx*dx + dy*dy > VEIN_R*VEIN_R*1.1 || oreRand() > FILL_P) continue
      const k = `${c.x+dx},${c.y+dy}`; if (mKeys.has(k)) oreSet.add(k)
    }
  }

  // Foothill fringe veins (smaller, fewer)
  const foothillTiles = mountainTiles.filter(t => (mountainHeightMap.get(`${t.x},${t.y}`) ?? 0) <= 0.6)
  const numVeinsF = oreCfg.foothillVeins
  for (let v = 0; v < numVeinsF && foothillTiles.length > 0; v++) {
    const c = foothillTiles[Math.floor(oreRand() * foothillTiles.length)]
    for (let dx = -VEIN_R; dx <= VEIN_R; dx++) for (let dy = -VEIN_R; dy <= VEIN_R; dy++) {
      const k = `${c.x+dx},${c.y+dy}`
      if (!mKeys.has(k) || (mountainHeightMap.get(k) ?? 0) > 0.85 || oreRand() > FILL_P) continue
      oreSet.add(k)
    }
  }
  const oreVeinTiles = Array.from(oreSet).map(k => { const [x,y]=k.split(',').map(Number); return{x,y} })

  // ── River buffer: 1格缓冲区，防止树木/草地渗入河道视觉范围 ─────────────────
  const riverBufferKeys = new Set<string>()
  for (const rt of riverTiles)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        riverBufferKeys.add(`${rt.x+dx},${rt.y+dy}`)

  // ── 7. Forest clusters (flat, non-mountain, non-river, outside city) ──────
  const forestSet  = new Set<string>()
  const forestRand = createRng(WORLD_SEED ^ 0xf01e57)
  const fcfg       = worldGenConfig.forest
  const FOREST_R   = fcfg.radius
  const forestCandidates: { x: number; y: number }[] = []
  for (let ix = minX; ix <= maxX; ix++) {
    for (let iy = minY; iy <= maxY; iy++) {
      const key = `${ix},${iy}`
      // 使用缓冲区而非 riverSet，让树木至少离河道 1 格
      if (riverBufferKeys.has(key) || mKeys.has(key)) continue
      if (Math.hypot(ix, iy) < fcfg.minDistCity) continue
      forestCandidates.push({ x: ix, y: iy })
    }
  }
  for (let v = 0; v < fcfg.clusters && forestCandidates.length > 0; v++) {
    const c = forestCandidates[Math.floor(forestRand() * forestCandidates.length)]
    for (let dx = -FOREST_R; dx <= FOREST_R; dx++) {
      for (let dy = -FOREST_R; dy <= FOREST_R; dy++) {
        if (dx*dx + dy*dy > FOREST_R*FOREST_R*1.1 || forestRand() > fcfg.fill) continue
        const nx = c.x+dx, ny = c.y+dy
        if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue
        const key = `${nx},${ny}`
        if (!riverBufferKeys.has(key) && !mKeys.has(key)) forestSet.add(key)
      }
    }
  }
  const forestTiles = Array.from(forestSet).map(k => { const [x,y]=k.split(',').map(Number); return{x,y} })

  // ── 8. Grassland clusters (flat, not forest/river/mountain, outside city) ─
  const grassSet  = new Set<string>()
  const grassRand = createRng(WORLD_SEED ^ 0xc0a51a0d)
  const gcfg      = worldGenConfig.grassland
  const GRASS_R   = gcfg.radius
  // candidates = flat tiles not already forest
  const grassCandidates = forestCandidates.filter(t => !forestSet.has(`${t.x},${t.y}`))
  for (let v = 0; v < gcfg.clusters && grassCandidates.length > 0; v++) {
    const c = grassCandidates[Math.floor(grassRand() * grassCandidates.length)]
    for (let dx = -GRASS_R; dx <= GRASS_R; dx++) {
      for (let dy = -GRASS_R; dy <= GRASS_R; dy++) {
        if (dx*dx + dy*dy > GRASS_R*GRASS_R*1.1 || grassRand() > gcfg.fill) continue
        const nx = c.x+dx, ny = c.y+dy
        if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue
        const key = `${nx},${ny}`
        if (!riverBufferKeys.has(key) && !mKeys.has(key) && !forestSet.has(key)) grassSet.add(key)
      }
    }
  }
  const grasslandTiles = Array.from(grassSet).map(k => { const [x,y]=k.split(',').map(Number); return{x,y} })

  // ── 9. Mountain forest tiles (松柏 — pine/fir on mid-elevation slopes) ────
  // Trees grow on mountain tiles with height in [0.15, 0.62]; ore veins excluded.
  const mountainForestSet = new Set<string>()
  const mfRand = createRng(WORLD_SEED ^ 0xa1b2c3d4)
  for (const mt of mountainTiles) {
    const h = mountainHeightMap.get(`${mt.x},${mt.y}`) ?? 0
    if (h >= 0.15 && h <= 0.62 && !oreSet.has(`${mt.x},${mt.y}`)) {
      if (mfRand() < 0.52) mountainForestSet.add(`${mt.x},${mt.y}`)
    }
  }
  const mountainForestTiles = Array.from(mountainForestSet).map(k => { const [x,y]=k.split(',').map(Number); return{x,y} })

  return { riverTiles, riverCenterLine, mountainTiles, mountainHeightMap, oreVeinTiles, forestTiles, grasslandTiles, mountainForestTiles, riverTribChains }
})()

// ─── Exports ──────────────────────────────────────────────────────────────
export const RIVER_TILES:            RiverTile[]              = _RIVER_TILES
export const RIVER_CENTER_LINE:      { x: number; y: number }[] = _RIVER_CENTER_LINE
export const MOUNTAIN_TILES:         { x: number; y: number }[] = _MOUNTAIN_TILES
export const ORE_VEIN_TILES:         { x: number; y: number }[] = _ORE_VEIN_TILES
export const FOREST_TILES:           { x: number; y: number }[] = _FOREST_TILES
export const GRASSLAND_TILES:        { x: number; y: number }[] = _GRASSLAND_TILES
export const MOUNTAIN_FOREST_TILES:  { x: number; y: number }[] = _MOUNTAIN_FOREST_TILES
export { MOUNTAIN_HEIGHT_MAP }
/** Ordered tributary chain arrays (one chain per tributary, west→east). */
export const RIVER_TRIB_CHAINS: { x: number; y: number }[][] = _RIVER_TRIB_CHAINS

// ─── River tile keys ───────────────────────────────────────────────────────
// Main river: centre-line ±1 Chebyshev buffer matches the visual ribbon (width 2.15).
const RIVER_TILE_KEYS = (() => {
  const set = new Set<string>()
  for (const { x, y } of RIVER_CENTER_LINE)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        set.add(`${x + dx},${y + dy}`)
  return set
})()
// Tributaries: centre-line tiles only (visual ribbon width 1.15 ≈ ±0.575 tile)
const RIVER_TRIB_TILE_KEYS = new Set<string>(
  _RIVER_TRIB_CHAINS.flatMap(chain => chain.map(p => `${p.x},${p.y}`))
)
/** All tributary tiles as a flat array (backward-compat + foam positions). */
export const RIVER_TRIB_TILES: { x: number; y: number }[] =
  Array.from(RIVER_TRIB_TILE_KEYS).map(k => { const [x, y] = k.split(',').map(Number); return { x, y } })

const MOUNTAIN_TILE_KEYS  = new Set(MOUNTAIN_TILES.map(t => `${t.x},${t.y}`))
const ORE_VEIN_TILE_KEYS  = new Set(ORE_VEIN_TILES.map(t => `${t.x},${t.y}`))
const FOREST_TILE_KEYS    = new Set(FOREST_TILES.map(t => `${t.x},${t.y}`))
const GRASSLAND_TILE_KEYS = new Set(GRASSLAND_TILES.map(t => `${t.x},${t.y}`))
const MOUNTAIN_FOREST_TILE_KEYS = new Set(MOUNTAIN_FOREST_TILES.map(t => `${t.x},${t.y}`))

export function isRiverAt(x: number, y: number): boolean          { return RIVER_TILE_KEYS.has(`${x},${y}`) || RIVER_TRIB_TILE_KEYS.has(`${x},${y}`) }
export function isMountainAt(x: number, y: number): boolean       { return MOUNTAIN_TILE_KEYS.has(`${x},${y}`) }
export function isOreVeinAt(x: number, y: number): boolean        { return ORE_VEIN_TILE_KEYS.has(`${x},${y}`) }
export function isForestAt(x: number, y: number): boolean         { return FOREST_TILE_KEYS.has(`${x},${y}`) }
export function isGrasslandAt(x: number, y: number): boolean      { return GRASSLAND_TILE_KEYS.has(`${x},${y}`) }
export function isMountainForestAt(x: number, y: number): boolean { return MOUNTAIN_FOREST_TILE_KEYS.has(`${x},${y}`) }
/** True for any forested tile — flat or mountain forest. Used for lumbercamp placement. */
export function isAnyForestAt(x: number, y: number): boolean      { return FOREST_TILE_KEYS.has(`${x},${y}`) || MOUNTAIN_FOREST_TILE_KEYS.has(`${x},${y}`) }
/** Normalised [0,1] height for mountain tiles (0 = just above threshold, 1 = peak). */
export function getMountainHeight(x: number, y: number): number { return MOUNTAIN_HEIGHT_MAP.get(`${x},${y}`) ?? 0 }

// ─── Within-3-tiles-of-river（农田开垦范围，Chebyshev ≤ 3）─────────────────
const NEAR_RIVER_FIVE_KEYS = (() => {
  const set = new Set<string>()
  for (const rt of RIVER_TILES)
    for (let dx = -3; dx <= 3; dx++)
      for (let dy = -3; dy <= 3; dy++)
        set.add(`${rt.x+dx},${rt.y+dy}`)
  return set
})()
export function isNearRiverFive(x: number, y: number): boolean {
  return NEAR_RIVER_FIVE_KEYS.has(`${x},${y}`) && !isRiverAt(x, y)
}

// ─── Debug exports (browser console) ─────────────────────────────────────
if (typeof window !== 'undefined') {
  try {
    ;(window as any).__RIVER_TILES__       = RIVER_TILES
    ;(window as any).__RIVER_CENTER_LINE__ = RIVER_CENTER_LINE
    ;(window as any).__MOUNTAIN_TILES__    = MOUNTAIN_TILES
    ;(window as any).__IS_MOUNTAIN_AT__    = isMountainAt
    ;(window as any).getMountainHeight     = getMountainHeight
    ;(window as any).MAP_SIZE_X            = MAP_SIZE_X
    ;(window as any).MAP_SIZE_Y            = MAP_SIZE_Y
  } catch { /* ignore */ }
}

