/**
 * Road A* pathfinding utilities — used by MapScene interaction handler
 * and exposed on window for e2e tests.
 */
import { isRiverAt, isMountainAt, MAP_SIZE_X, MAP_SIZE_Y } from '../state/worldgen'

// ─── Bresenham raster line ─────────────────────────────────────────────────

export function rasterLine(a: { x: number; y: number }, b: { x: number; y: number }) {
  const pts: { x: number; y: number }[] = []
  let dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y)
  const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1
  let err = dx - dy, x = a.x, y = a.y
  while (true) {
    pts.push({ x, y }); if (x === b.x && y === b.y) break
    const e2 = err * 2
    if (e2 > -dy) { err -= dy; x += sx }
    if (e2 < dx) { err += dx; y += sy }
  }
  return pts
}

// ─── Expand diagonal steps to 4-neighbour path ────────────────────────────

export function expandToFourNeighborPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return pts
  const out: { x: number; y: number }[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1], cur = pts[i]
    const dx = cur.x - prev.x, dy = cur.y - prev.y
    if (Math.abs(dx) === 1 && Math.abs(dy) === 1) out.push({ x: cur.x, y: prev.y })
    out.push(cur)
  }
  return out
}

// ─── Min-heap ─────────────────────────────────────────────────────────────

class MinHeap<T> {
  private data: { f: number; item: T }[] = []
  push(f: number, item: T) { this.data.push({ f, item }); this._up(this.data.length - 1) }
  pop(): T | undefined {
    if (!this.data.length) return undefined
    const top = this.data[0].item
    const last = this.data.pop()!
    if (this.data.length) { this.data[0] = last; this._dn(0) }
    return top
  }
  get size() { return this.data.length }
  private _up(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.data[p].f <= this.data[i].f) break
      ;[this.data[p], this.data[i]] = [this.data[i], this.data[p]]; i = p
    }
  }
  private _dn(i: number) {
    for (;;) {
      let m = i; const l = 2*i+1, r = 2*i+2
      if (l < this.data.length && this.data[l].f < this.data[m].f) m = l
      if (r < this.data.length && this.data[r].f < this.data[m].f) m = r
      if (m === i) break
      ;[this.data[m], this.data[i]] = [this.data[i], this.data[m]]; i = m
    }
  }
}

// ─── A* road pathfinding ───────────────────────────────────────────────────

/**
 * A* on the tile grid.
 * avoidMountains=true  → mtn tiles cost 100 (detour if flat path exists)
 * avoidMountains=false → mtn tiles cost 2   (allowed when dest is on mtn)
 * River tiles are impassable unless bridged (cost 8).
 */
export function astarRoad(
  start: { x: number; y: number },
  end: { x: number; y: number },
  avoidMountains: boolean,
  blockedTiles?: Set<string>,
): { x: number; y: number }[] {
  const halfX = Math.floor(MAP_SIZE_X / 2), halfY = Math.floor(MAP_SIZE_Y / 2)
  const inBounds = (x: number, y: number) => x >= -halfX && x < halfX && y >= -halfY && y < halfY
  const tileCost = (x: number, y: number) => {
    if (blockedTiles?.has(`${x},${y}`)) return Infinity
    if (isRiverAt(x, y))   return 8
    if (isMountainAt(x, y)) return avoidMountains ? 100 : 2
    return 1
  }
  const h = (x: number, y: number) => Math.abs(x - end.x) + Math.abs(y - end.y)
  const key = (x: number, y: number) => `${x},${y}`
  const sk = key(start.x, start.y), ek = key(end.x, end.y)
  const gScore = new Map([[sk, 0]])
  const parent = new Map<string, string | null>([[sk, null]])
  const closed = new Set<string>()
  const heap = new MinHeap<{ x: number; y: number; k: string }>()
  heap.push(h(start.x, start.y), { x: start.x, y: start.y, k: sk })
  const DIRS = [{ x:1,y:0 },{ x:-1,y:0 },{ x:0,y:1 },{ x:0,y:-1 }]
  let found = false
  for (let iter = 0; iter < 5000 && heap.size > 0; iter++) {
    const cur = heap.pop()!
    if (closed.has(cur.k)) continue
    if (cur.k === ek) { found = true; break }
    closed.add(cur.k)
    const curG = gScore.get(cur.k) ?? Infinity
    for (const d of DIRS) {
      const nx = cur.x + d.x, ny = cur.y + d.y
      if (!inBounds(nx, ny)) continue
      const nk = key(nx, ny); if (closed.has(nk)) continue
      const cost = tileCost(nx, ny); if (!isFinite(cost)) continue
      const newG = curG + cost
      if (newG < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, newG); parent.set(nk, cur.k)
        heap.push(newG + h(nx, ny), { x: nx, y: ny, k: nk })
      }
    }
  }
  if (!found) return rasterLine(start, end)
  const path: { x: number; y: number }[] = []
  let k: string | null = ek
  while (k !== null) { const [xi, yi] = k.split(',').map(Number); path.push({ x: xi, y: yi }); k = parent.get(k) ?? null }
  return path.reverse()
}

