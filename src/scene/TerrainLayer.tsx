/**
 * TerrainLayer — ground tiles, mountains, river ribbon + foam, ore veins,
 * and the arable-land overlay shown while placing farm zones.
 */
import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RIVER_TILES, RIVER_CENTER_LINE, MAP_SIZE_X, MAP_SIZE_Y } from '../state/worldgen'
import worldGenConfig from '../config/world-gen'
import { palette } from '../theme/palette'
import { tileH } from '../config/characters/_shared'
import { TileInstances, FlatInstances, CircleInstances } from './MapPrimitives'

// ─── River curve (computed once at module load) ────────────────────────────

function chaikinSmooth(points: { x: number; y: number }[], iterations = 3) {
  if (points.length < 2) return points.slice()
  let out = points.map(p => ({ ...p }))
  for (let it = 0; it < iterations; it++) {
    const next: { x: number; y: number }[] = [out[0]]
    for (let i = 0; i < out.length - 1; i++) {
      const p0 = out[i], p1 = out[i + 1]
      next.push(
        { x: p0.x * 0.75 + p1.x * 0.25, y: p0.y * 0.75 + p1.y * 0.25 },
        { x: p0.x * 0.25 + p1.x * 0.75, y: p0.y * 0.25 + p1.y * 0.75 },
      )
    }
    next.push(out[out.length - 1]); out = next
  }
  return out
}

function rdpSimplify(points: { x: number; y: number }[], epsilon = 0.6): { x: number; y: number }[] {
  if (points.length < 3) return points.slice()
  function perpDist(pt: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
    const dx = b.x - a.x, dy = b.y - a.y
    if (dx === 0 && dy === 0) return Math.hypot(pt.x - a.x, pt.y - a.y)
    const t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (dx * dx + dy * dy)
    return Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy))
  }
  function rec(pts: { x: number; y: number }[]): { x: number; y: number }[] {
    if (pts.length < 3) return pts.slice()
    let maxD = -1, idx = -1
    for (let i = 1; i < pts.length - 1; i++) { const d = perpDist(pts[i], pts[0], pts[pts.length - 1]); if (d > maxD) { maxD = d; idx = i } }
    if (maxD > epsilon) return rec(pts.slice(0, idx + 1)).slice(0, -1).concat(rec(pts.slice(idx)))
    return [pts[0], pts[pts.length - 1]]
  }
  return rec(points)
}

const RIVER_CURVE: THREE.CatmullRomCurve3 | null = (() => {
  if (RIVER_CENTER_LINE.length < 4) return null
  const smooth = chaikinSmooth(RIVER_CENTER_LINE, 4)
  if (smooth.length < 4) return null
  const simplified = rdpSimplify(smooth, 0.6)
  const used = simplified.length >= 4 ? simplified : smooth
  const pts = used.map(p => new THREE.Vector3(p.x, 0, p.y))
  const d0x = pts[1].x - pts[0].x, d0z = pts[1].z - pts[0].z
  const dNx = pts[pts.length - 1].x - pts[pts.length - 2].x
  const dNz = pts[pts.length - 1].z - pts[pts.length - 2].z
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(pts[0].x - d0x, 0, pts[0].z - d0z),
    ...pts,
    new THREE.Vector3(pts[pts.length - 1].x + dNx, 0, pts[pts.length - 1].z + dNz),
  ], false, 'centripetal', 0.5)
})()

export const RIVER_FOAM_POSITIONS: { x: number; y: number }[] = RIVER_CURVE
  ? RIVER_CURVE.getPoints(RIVER_CENTER_LINE.length * 3).map(p => ({ x: p.x, y: p.z }))
  : RIVER_TILES as { x: number; y: number }[]

const _MAX_MOUNTAIN_H = 0.04 + worldGenConfig.mountain.tileScale

const _riverRibbonGeo: THREE.BufferGeometry | null = (() => {
  if (!RIVER_CURVE) return null
  const WATER_Y = 0.030, WIDTH = 2.15
  const SAMPLES = Math.max(Math.floor(RIVER_CENTER_LINE.length * 12 * ((MAP_SIZE_X * MAP_SIZE_Y) / (120 * 90))), 48)
  const cpts = RIVER_CURVE.getPoints(SAMPLES)
  const pos: number[] = [], uvs: number[] = [], idx: number[] = []
  for (let i = 0; i < cpts.length; i++) {
    const p = cpts[i], u = i / (cpts.length - 1)
    const tan = RIVER_CURVE.getTangent(u)
    const len = Math.sqrt(tan.x * tan.x + tan.z * tan.z) || 1
    const px = -tan.z / len, pz = tan.x / len
    pos.push(p.x + px * WIDTH * 0.5, WATER_Y, p.z + pz * WIDTH * 0.5,
             p.x - px * WIDTH * 0.5, WATER_Y, p.z - pz * WIDTH * 0.5)
    uvs.push(u, 0, u, 1)
    if (i < cpts.length - 1) { const b = i * 2; idx.push(b, b+1, b+2, b+1, b+3, b+2) }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(idx); geo.computeVertexNormals()
  return geo
})()

// ─── Mountain instanced boxes ──────────────────────────────────────────────

function MountainInstances({ tiles }: { tiles: [number, number][] }) {
  const ref = React.useRef<THREE.InstancedMesh>(null)
  const data = React.useMemo(() => tiles.map(([x, y]) => ({ x, y, h: tileH(x, y) })), [tiles])
  React.useLayoutEffect(() => {
    if (!ref.current || data.length === 0) return
    const mesh = ref.current; const temp = new THREE.Object3D(); const color = new THREE.Color()
    mesh.count = data.length
    for (let i = 0; i < data.length; i++) {
      const { x, y, h } = data[i]
      temp.position.set(x, h * 0.5, y); temp.scale.set(0.97, h, 0.97)
      temp.rotation.set(0, 0, 0); temp.updateMatrix()
      mesh.setMatrixAt(i, temp.matrix)
      const t2 = h / _MAX_MOUNTAIN_H
      const noise = 0.88 + (Math.abs((x * 7 + y * 13) % 14)) / 100
      color.setRGB((0.44 - t2 * 0.10) * noise, (0.38 - t2 * 0.07) * noise, (0.32 - t2 * 0.03) * noise)
      mesh.setColorAt(i, color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [data])
  if (tiles.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(data.length, 1)]}
      frustumCulled={false} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.95} metalness={0.05} />
    </instancedMesh>
  )
}

// ─── Smooth river ribbon ───────────────────────────────────────────────────

function SmoothRiverMesh() {
  if (!_riverRibbonGeo) return null
  return (
    <mesh geometry={_riverRibbonGeo} frustumCulled={false} renderOrder={1}>
      <meshBasicMaterial color={palette.map.river} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

// ─── Animated foam ────────────────────────────────────────────────────────

function AnimatedRiverFoam({ tiles }: { tiles: Array<{ x: number; y: number }> }) {
  const ref1 = React.useRef<THREE.InstancedMesh>(null)
  const ref2 = React.useRef<THREE.InstancedMesh>(null)
  const timeRef = React.useRef(0)
  const n = tiles.length
  const update = React.useCallback((t: number) => {
    for (const [ref, phaseOffset] of [[ref1, 0], [ref2, 0.5]] as const) {
      const mesh = ref.current; if (!mesh || n === 0) continue
      const temp = new THREE.Object3D()
      for (let i = 0; i < n; i++) {
        const { x, y } = tiles[i]
        const phase = ((t * 0.35 + phaseOffset + (x + y) * 0.08) % 1) - 0.5
        temp.position.set(x + phase * 0.55, 0.034, y + phase * 0.15)
        temp.rotation.set(-Math.PI / 2, 0, Math.PI / 5.5)
        temp.scale.set(1, 1, 1); temp.updateMatrix()
        mesh.setMatrixAt(i, temp.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
  }, [tiles, n])
  React.useLayoutEffect(() => { if (ref1.current) ref1.current.count = n; if (ref2.current) ref2.current.count = n; update(0) }, [tiles, n, update])
  useFrame((_, delta) => { timeRef.current += delta; update(timeRef.current) })
  if (n === 0) return null
  return (
    <>
      <instancedMesh ref={ref1} args={[undefined, undefined, Math.max(n, 1)]} frustumCulled={false}>
        <planeGeometry args={[0.68, 0.11]} />
        <meshBasicMaterial color={palette.map.riverFoam} transparent opacity={0.38} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={ref2} args={[undefined, undefined, Math.max(n, 1)]} frustumCulled={false}>
        <planeGeometry args={[0.46, 0.08]} />
        <meshBasicMaterial color={palette.map.riverFoam} transparent opacity={0.25} depthWrite={false} />
      </instancedMesh>
    </>
  )
}

// ─── Forest tree sprites (procedural low-poly cones) ──────────────────────

function ForestInstances({ tiles }: { tiles: Array<{ x: number; y: number }> }) {
  const trunkRef = React.useRef<THREE.InstancedMesh>(null)
  const crownRef = React.useRef<THREE.InstancedMesh>(null)

  const { trunks, crowns } = React.useMemo(() => {
    type Item = { wx: number; wz: number; sx: number; sy: number; sz: number; ry: number }
    const trunks: Item[] = [], crowns: Item[] = []
    for (const { x, y } of tiles) {
      let s = (((x * 73856093) ^ (y * 19349663)) >>> 0)
      const rng = () => { s = ((Math.imul(s, 1664525) + 1013904223) >>> 0); return s / 4294967296 }
      // 1 main tree
      const th = 0.22 + rng() * 0.14
      trunks.push({ wx: x + (rng()-0.5)*0.3, wz: y + (rng()-0.5)*0.3, sx: 0.07, sy: th, sz: 0.07, ry: rng()*Math.PI*2 })
      const cr = 0.22 + rng() * 0.12
      crowns.push({ wx: trunks[trunks.length-1].wx, wz: trunks[trunks.length-1].wz, sx: cr, sy: cr*(1.2+rng()*0.6), sz: cr, ry: rng()*Math.PI*2 })
      // 1-2 smaller trees
      for (let i = 0; i < 1 + Math.floor(rng()*2); i++) {
        const th2 = 0.14 + rng() * 0.10
        const wx2 = x + (rng()-0.5)*0.72, wz2 = y + (rng()-0.5)*0.72
        trunks.push({ wx: wx2, wz: wz2, sx: 0.05, sy: th2, sz: 0.05, ry: rng()*Math.PI*2 })
        const cr2 = 0.14 + rng() * 0.09
        crowns.push({ wx: wx2, wz: wz2, sx: cr2, sy: cr2*(1.1+rng()*0.5), sz: cr2, ry: rng()*Math.PI*2 })
      }
    }
    return { trunks, crowns }
  }, [tiles])

  React.useLayoutEffect(() => {
    const tmp = new THREE.Object3D()
    if (trunkRef.current && trunks.length > 0) {
      const mesh = trunkRef.current; mesh.count = trunks.length
      for (let i = 0; i < trunks.length; i++) {
        const r = trunks[i]
        tmp.position.set(r.wx, r.sy, r.wz); tmp.rotation.set(0, r.ry, 0)
        tmp.scale.set(r.sx, r.sy, r.sz); tmp.updateMatrix(); mesh.setMatrixAt(i, tmp.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
    if (crownRef.current && crowns.length > 0) {
      const mesh = crownRef.current; mesh.count = crowns.length
      for (let i = 0; i < crowns.length; i++) {
        const r = crowns[i]; const trk = trunks[i]
        tmp.position.set(r.wx, (trk?.sy ?? 0.2) * 2 + r.sy * 0.5, r.wz)
        tmp.rotation.set(0, r.ry, 0); tmp.scale.set(r.sx, r.sy, r.sz)
        tmp.updateMatrix(); mesh.setMatrixAt(i, tmp.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
  }, [trunks, crowns])

  if (!tiles.length) return null
  return (
    <>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, Math.max(trunks.length, 1)]} frustumCulled={false}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshStandardMaterial color="#7a5020" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={crownRef} args={[undefined, undefined, Math.max(crowns.length, 1)]} frustumCulled={false}>
        <coneGeometry args={[1, 1, 6]} />
        <meshStandardMaterial color="#2d6a28" roughness={0.8} />
      </instancedMesh>
    </>
  )
}

// ─── Mountain pine/fir tree sprites (松柏 — slim cones, dark blue-green) ───

function PineTreeInstances({ tiles }: { tiles: Array<{ x: number; y: number }> }) {
  const trunkRef = React.useRef<THREE.InstancedMesh>(null)
  const cone1Ref = React.useRef<THREE.InstancedMesh>(null)
  const cone2Ref = React.useRef<THREE.InstancedMesh>(null)

  type PineData = { wx: number; wz: number; bh: number; th: number; r1: number; r2: number; ry: number }
  const pines = React.useMemo<PineData[]>(() => {
    const out: PineData[] = []
    for (const { x, y } of tiles) {
      const bh = tileH(x, y)
      let s = (((x * 73856093) ^ (y * 19349663)) >>> 0)
      const rng = () => { s = ((Math.imul(s, 1664525) + 1013904223) >>> 0); return s / 4294967296 }
      // 主松树
      const th = 0.30 + rng() * 0.22
      const r1 = 0.18 + rng() * 0.09
      out.push({ wx: x + (rng()-0.5)*0.28, wz: y + (rng()-0.5)*0.28, bh, th, r1, r2: r1 * 0.58, ry: rng()*Math.PI*2 })
      // 0–1 副松树
      if (rng() > 0.42) {
        const th2 = 0.18 + rng() * 0.14
        const r1b = 0.11 + rng() * 0.06
        out.push({ wx: x + (rng()-0.5)*0.70, wz: y + (rng()-0.5)*0.70, bh, th: th2, r1: r1b, r2: r1b*0.58, ry: rng()*Math.PI*2 })
      }
    }
    return out
  }, [tiles])

  React.useLayoutEffect(() => {
    const tmp = new THREE.Object3D()
    if (trunkRef.current && pines.length > 0) {
      const mesh = trunkRef.current; mesh.count = pines.length
      for (let i = 0; i < pines.length; i++) {
        const p = pines[i]
        tmp.position.set(p.wx, p.bh + p.th * 0.5, p.wz); tmp.rotation.set(0, p.ry, 0)
        tmp.scale.set(0.045, p.th, 0.045); tmp.updateMatrix(); mesh.setMatrixAt(i, tmp.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
    if (cone1Ref.current && pines.length > 0) {
      const mesh = cone1Ref.current; mesh.count = pines.length
      for (let i = 0; i < pines.length; i++) {
        const p = pines[i]
        tmp.position.set(p.wx, p.bh + p.th * 1.05 + p.r1 * 0.45, p.wz); tmp.rotation.set(0, p.ry, 0)
        tmp.scale.set(p.r1, p.r1 * 1.55, p.r1); tmp.updateMatrix(); mesh.setMatrixAt(i, tmp.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
    if (cone2Ref.current && pines.length > 0) {
      const mesh = cone2Ref.current; mesh.count = pines.length
      for (let i = 0; i < pines.length; i++) {
        const p = pines[i]
        tmp.position.set(p.wx, p.bh + p.th * 1.55 + p.r2 * 0.45, p.wz); tmp.rotation.set(0, p.ry, 0)
        tmp.scale.set(p.r2, p.r2 * 1.60, p.r2); tmp.updateMatrix(); mesh.setMatrixAt(i, tmp.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
  }, [pines])

  if (!tiles.length) return null
  return (
    <>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, Math.max(pines.length, 1)]} frustumCulled={false}>
        <cylinderGeometry args={[1, 1, 1, 5]} />
        <meshStandardMaterial color="#5a3010" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={cone1Ref} args={[undefined, undefined, Math.max(pines.length, 1)]} frustumCulled={false}>
        <coneGeometry args={[1, 1, 6]} />
        <meshStandardMaterial color="#1a4830" roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={cone2Ref} args={[undefined, undefined, Math.max(pines.length, 1)]} frustumCulled={false}>
        <coneGeometry args={[1, 1, 6]} />
        <meshStandardMaterial color="#1e5535" roughness={0.80} />
      </instancedMesh>
    </>
  )
}

// ─── Ore vein rock piles (procedural, no texture) ─────────────────────────

function OreVeinInstances({ tiles }: { tiles: Array<{ x: number; y: number }> }) {
  const bigRef = React.useRef<THREE.InstancedMesh>(null)
  const smlRef = React.useRef<THREE.InstancedMesh>(null)

  // Expand each tile → 1 large + 3 small rocks, deterministic per tile coords
  const { bigRocks, smlRocks } = React.useMemo(() => {
    type Rock = { wx: number; wz: number; h: number; sx: number; sy: number; sz: number; ry: number }
    const bigRocks: Rock[] = []
    const smlRocks: Rock[] = []
    for (const { x, y } of tiles) {
      const h = tileH(x, y)
      let s = (((x * 73856093) ^ (y * 19349663)) >>> 0)
      const rng = () => { s = ((Math.imul(s, 1664525) + 1013904223) >>> 0); return s / 4294967296 }

      // 1 large rock, slightly off-centre
      const bs = 0.13 + rng() * 0.09
      bigRocks.push({
        wx: x + (rng() - 0.5) * 0.25, wz: y + (rng() - 0.5) * 0.25, h,
        sx: bs * (0.9 + rng() * 0.2), sy: bs * (0.55 + rng() * 0.2), sz: bs,
        ry: rng() * Math.PI * 2,
      })

      // 3 small pebbles scattered around it
      for (let i = 0; i < 3; i++) {
        const ss = 0.055 + rng() * 0.055
        smlRocks.push({
          wx: x + (rng() - 0.5) * 0.62, wz: y + (rng() - 0.5) * 0.62, h,
          sx: ss * (0.85 + rng() * 0.3), sy: ss * (0.45 + rng() * 0.25), sz: ss,
          ry: rng() * Math.PI * 2,
        })
      }
    }
    return { bigRocks, smlRocks }
  }, [tiles])

  React.useLayoutEffect(() => {
    const tmp = new THREE.Object3D()
    if (bigRef.current && bigRocks.length > 0) {
      const mesh = bigRef.current
      mesh.count = bigRocks.length
      for (let i = 0; i < bigRocks.length; i++) {
        const r = bigRocks[i]
        tmp.position.set(r.wx, r.h + r.sy, r.wz)
        tmp.rotation.set(0, r.ry, 0)
        tmp.scale.set(r.sx, r.sy, r.sz)
        tmp.updateMatrix(); mesh.setMatrixAt(i, tmp.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
    if (smlRef.current && smlRocks.length > 0) {
      const mesh = smlRef.current
      mesh.count = smlRocks.length
      for (let i = 0; i < smlRocks.length; i++) {
        const r = smlRocks[i]
        tmp.position.set(r.wx, r.h + r.sy, r.wz)
        tmp.rotation.set(0, r.ry, 0)
        tmp.scale.set(r.sx, r.sy, r.sz)
        tmp.updateMatrix(); mesh.setMatrixAt(i, tmp.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
  }, [bigRocks, smlRocks])

  if (!tiles.length) return null
  return (
    <>
      {/* large iron-ore rocks – metallic steel-grey */}
      <instancedMesh ref={bigRef} args={[undefined, undefined, Math.max(bigRocks.length, 1)]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#6a6e78" metalness={0.85} roughness={0.25} />
      </instancedMesh>
      {/* small surrounding pebbles – slightly rusty/earthy */}
      <instancedMesh ref={smlRef} args={[undefined, undefined, Math.max(smlRocks.length, 1)]} frustumCulled={false}>
        <sphereGeometry args={[1, 5, 4]} />
        <meshStandardMaterial color="#5a5248" metalness={0.45} roughness={0.60} />
      </instancedMesh>
    </>
  )
}

// ─── Grassland patches ─────────────────────────────────────────────────────

function GrasslandInstances({ tiles }: { tiles: Array<{ x: number; y: number }> }) {
  if (!tiles.length) return null
  return (
    <>
      <FlatInstances items={tiles} y={0.006} size={[0.94, 0.94]} color="#8aaa3c" opacity={0.80} />
      <FlatInstances items={tiles} y={0.007} size={[0.46, 0.46]} color="#6a8a28" opacity={0.55} />
    </>
  )
}

// ─── Resource health overlay (shown when mine/lumbercamp selected) ──────────

export type ResourceOverlayTile = { x: number; y: number; pct: number }

function ResourceHealthOverlay({ tiles }: { tiles: ResourceOverlayTile[] }) {
  const full     = React.useMemo(() => tiles.filter(t => t.pct > 0.6),                    [tiles])
  const medium   = React.useMemo(() => tiles.filter(t => t.pct > 0.2 && t.pct <= 0.6),   [tiles])
  const low      = React.useMemo(() => tiles.filter(t => t.pct > 0   && t.pct <= 0.2),   [tiles])
  const depleted = React.useMemo(() => tiles.filter(t => t.pct <= 0),                     [tiles])
  return (
    <>
      {full.length     > 0 && <CircleInstances items={full}     y={0.10} radius={0.34} color="#52c41a" opacity={0.80} />}
      {medium.length   > 0 && <CircleInstances items={medium}   y={0.10} radius={0.34} color="#faad14" opacity={0.80} />}
      {low.length      > 0 && <CircleInstances items={low}      y={0.10} radius={0.34} color="#ff4d4f" opacity={0.85} />}
      {depleted.length > 0 && <CircleInstances items={depleted} y={0.10} radius={0.28} color="#888888" opacity={0.55} />}
    </>
  )
}

// ─── Public layer component ────────────────────────────────────────────────

export interface TerrainLayerProps {
  visibleTiles: [number, number][]
  visibleMountainTiles: [number, number][]
  visibleOreVeinTiles: Array<{ x: number; y: number }>
  visibleForestTiles: Array<{ x: number; y: number }>
  visibleMountainForestTiles: Array<{ x: number; y: number }>
  visibleGrasslandTiles: Array<{ x: number; y: number }>
  visibleArableTiles: Array<{ x: number; y: number }>
  visibleMountainArableTiles: Array<{ x: number; y: number }>
  showTerrainOverlay: boolean
  resourceOverlay: ResourceOverlayTile[] | null
}

export function TerrainLayer({
  visibleTiles, visibleMountainTiles, visibleOreVeinTiles,
  visibleForestTiles, visibleMountainForestTiles, visibleGrasslandTiles,
  visibleArableTiles, visibleMountainArableTiles,
  showTerrainOverlay, resourceOverlay,
}: TerrainLayerProps) {
  return (
    <>
      <TileInstances tiles={visibleTiles} />
      <MountainInstances tiles={visibleMountainTiles} />
      <SmoothRiverMesh />
      <AnimatedRiverFoam tiles={RIVER_FOAM_POSITIONS} />
      {visibleGrasslandTiles.length > 0 && <GrasslandInstances tiles={visibleGrasslandTiles} />}
      {visibleForestTiles.length > 0 && <ForestInstances tiles={visibleForestTiles} />}
      {visibleMountainForestTiles.length > 0 && <PineTreeInstances tiles={visibleMountainForestTiles} />}
      {visibleOreVeinTiles.length > 0 && <OreVeinInstances tiles={visibleOreVeinTiles} />}
      {resourceOverlay && resourceOverlay.length > 0 && <ResourceHealthOverlay tiles={resourceOverlay} />}
      {showTerrainOverlay && (
        <>
          {/* 粮田可开垦地（浅绿圆点） */}
          <CircleInstances items={visibleArableTiles} y={0.012} radius={0.08} color={palette.map.arableMark} opacity={0.85} />
          {/* 茶园可开垦地（山地，琥珀色圆点） */}
          <CircleInstances items={visibleMountainArableTiles} y={0.012} radius={0.08} color="#d48806" opacity={0.70} />
        </>
      )}
    </>
  )
}

