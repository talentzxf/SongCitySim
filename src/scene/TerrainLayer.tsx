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

// ─── Public layer component ────────────────────────────────────────────────

export interface TerrainLayerProps {
  visibleTiles: [number, number][]
  visibleMountainTiles: [number, number][]
  visibleOreVeinTiles: Array<{ x: number; y: number }>
  visibleArableTiles: Array<{ x: number; y: number }>
  showTerrainOverlay: boolean
}

export function TerrainLayer({
  visibleTiles, visibleMountainTiles, visibleOreVeinTiles, visibleArableTiles, showTerrainOverlay,
}: TerrainLayerProps) {
  return (
    <>
      <TileInstances tiles={visibleTiles} />
      <MountainInstances tiles={visibleMountainTiles} />
      <SmoothRiverMesh />
      <AnimatedRiverFoam tiles={RIVER_FOAM_POSITIONS} />
      {visibleOreVeinTiles.length > 0 && (
        <>
          <FlatInstances items={visibleOreVeinTiles} y={0.32} size={[0.36, 0.36]} color="#5a1208" opacity={0.95} rotationZ={Math.PI / 4} />
          <FlatInstances items={visibleOreVeinTiles} y={0.33} size={[0.20, 0.20]} color="#c83c18" opacity={0.90} rotationZ={Math.PI / 4} />
        </>
      )}
      {showTerrainOverlay && (
        <CircleInstances items={visibleArableTiles} y={0.012} radius={0.08} color={palette.map.arableMark} opacity={0.85} />
      )}
    </>
  )
}

