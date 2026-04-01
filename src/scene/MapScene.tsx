import React from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { SIM_TICK_MS } from '../config/simulation'
import {
  useSimulation, logicalMigrantPos, logicalWalkerPos, logicalOxCartPos, logicalMarketBuyerPos,
  logicalPeddlerPos, type Peddler,
  RIVER_TILES, isRiverAt, isNearRiverFive, RIVER_CENTER_LINE,
  MOUNTAIN_TILES, ORE_VEIN_TILES, isMountainAt, isOreVeinAt, getMountainHeight, MAP_SIZE_X, MAP_SIZE_Y,
  BUILDING_COST, ALL_BUILDING_TYPES, type BuildingType, type Tool, type CityState,
} from '../state/simulation'
import worldGenConfig from '../config/world-gen'
import { palette } from '../theme/palette'
import { SpatialBST, type RangeRect } from './spatialBst'
import { message } from 'antd'

// ─── Smooth river curve (computed once at module load) ─────────────────────
// Build a softened centre-line from the discrete per-column centre points.
// Steps:
//  1) Chaikin smoothing to remove sharp polyline corners
//  2) Ramer-Douglas-Peucker simplification to drop small wiggles (reduce curvature magnitude)
//  3) Build a centripetal Catmull-Rom curve from the cleaned points
function chaikinSmooth(points: { x: number; y: number }[], iterations = 3) {
  if (points.length < 2) return points.slice()
  let out = points.map(p => ({ x: p.x, y: p.y }))
  for (let it = 0; it < iterations; it++) {
    const next: { x: number; y: number }[] = []
    next.push(out[0]) // preserve start endpoint
    for (let i = 0; i < out.length - 1; i++) {
      const p0 = out[i], p1 = out[i + 1]
      const q = { x: p0.x * 0.75 + p1.x * 0.25, y: p0.y * 0.75 + p1.y * 0.25 }
      const r = { x: p0.x * 0.25 + p1.x * 0.75, y: p0.y * 0.25 + p1.y * 0.75 }
      next.push(q, r)
    }
    next.push(out[out.length - 1]) // preserve end endpoint
    out = next
  }
  return out
}

// Ramer-Douglas-Peucker polyline simplification
function rdpSimplify(points: { x: number; y: number }[], epsilon = 0.6): { x: number; y: number }[] {
  if (points.length < 3) return points.slice()
  const sq = (a: number) => a * a
  function perpDist(pt: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
    const dx = b.x - a.x, dy = b.y - a.y
    if (dx === 0 && dy === 0) return Math.hypot(pt.x - a.x, pt.y - a.y)
    const t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (dx * dx + dy * dy)
    const projx = a.x + t * dx, projy = a.y + t * dy
    return Math.hypot(pt.x - projx, pt.y - projy)
  }
  function rec(pts: { x: number; y: number }[]) : { x: number; y: number }[] {
    if (pts.length < 3) return pts.slice()
    let maxDist = -1; let idx = -1
    for (let i = 1; i < pts.length - 1; i++) {
      const d = perpDist(pts[i], pts[0], pts[pts.length - 1])
      if (d > maxDist) { maxDist = d; idx = i }
    }
    if (maxDist > epsilon) {
      const left = rec(pts.slice(0, idx + 1))
      const right = rec(pts.slice(idx))
      return left.slice(0, -1).concat(right)
    }
    return [pts[0], pts[pts.length - 1]]
  }
  return rec(points)
}

const RIVER_CURVE: THREE.CatmullRomCurve3 | null = (() => {
  if (RIVER_CENTER_LINE.length < 4) return null
  // 1) Chaikin smoothing to remove sharp corners
  const smooth = chaikinSmooth(RIVER_CENTER_LINE, 4)
  if (smooth.length < 4) return null
  // 2) Simplify tiny wiggles so the curve doesn't overbend around minor irregularities
  const simplified = rdpSimplify(smooth, 0.6)
  const used = simplified.length >= 4 ? simplified : smooth
  const pts = used.map(p => new THREE.Vector3(p.x, 0, p.y))
  // compute end tangents from first/last segment of cleaned polyline
  const d0x = pts[1].x - pts[0].x, d0z = pts[1].z - pts[0].z
  const dNx = pts[pts.length - 1].x - pts[pts.length - 2].x
  const dNz = pts[pts.length - 1].z - pts[pts.length - 2].z
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(pts[0].x - d0x, 0, pts[0].z - d0z),
    ...pts,
    new THREE.Vector3(pts[pts.length - 1].x + dNx, 0, pts[pts.length - 1].z + dNz),
  ], false, 'centripetal', 0.5)
})()

// Dense sample points along the smooth curve – used for animated foam placement
const RIVER_FOAM_POSITIONS: { x: number; y: number }[] = RIVER_CURVE
  ? RIVER_CURVE.getPoints(RIVER_CENTER_LINE.length * 3).map(p => ({ x: p.x, y: p.z }))
  : RIVER_TILES as { x: number; y: number }[]

// Expose river data for testing/debugging in the browser (Playwright test will read these)
if (typeof window !== 'undefined') {
  ;(window as any).__RIVER_CENTER_LINE__ = RIVER_CENTER_LINE
  ;(window as any).__RIVER_TILES__ = RIVER_TILES
  // Debug overlay for culling and controls (read by debug UI in App)
  ;(window as any).__MAP_DEBUG__ = (window as any).__MAP_DEBUG__ || {}
}

type ResidentRenderItem = { id: string; x: number; y: number; seed: number }

// ─── Day/Night Lighting ────────────────────────────────────────────────────

function DayNightLighting() {
  const { state } = useSimulation()
  const { scene } = useThree()
  const dayRef = React.useRef(state.dayTime)
  const ambRef = React.useRef<THREE.AmbientLight>(null)
  const dirRef = React.useRef<THREE.DirectionalLight>(null)

  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])

  useFrame(() => {
    const t = dayRef.current
    const isDay = t >= 0.25 && t <= 0.75
    const dayFraction = Math.max(0, Math.min(1, (t - 0.25) / 0.5))
    const sunArc = Math.sin(dayFraction * Math.PI)   // 0 dawn→1 noon→0 dusk

    if (ambRef.current) {
      if (isDay) {
        ambRef.current.intensity = 0.18 + sunArc * 0.55
        ambRef.current.color.setHSL(0.1 + sunArc * 0.04, 0.1, 1)
      } else {
        ambRef.current.intensity = 0.06
        ambRef.current.color.setHSL(0.62, 0.35, 0.4)
      }
    }
    if (dirRef.current) {
      if (isDay) {
        dirRef.current.intensity = 0.25 + sunArc * 0.85
        const sx = Math.cos(dayFraction * Math.PI - Math.PI / 2) * 50
        const sy = Math.sin(dayFraction * Math.PI) * 60 + 5
        dirRef.current.position.set(sx, sy, 40)
        dirRef.current.color.setHSL(0.08 + sunArc * 0.04, 0.5, 0.95)
      } else {
        dirRef.current.intensity = 0.08
        dirRef.current.position.set(-40, 50, -30)
        dirRef.current.color.setHSL(0.63, 0.15, 0.9)
      }
    }

    // Sky color
    if (isDay) {
      const h = 0.04 + sunArc * 0.54    // orange dawn → sky blue noon
      const s = 0.55 + sunArc * 0.35
      const l = 0.38 + sunArc * 0.32
      scene.background = new THREE.Color().setHSL(h, s, l)
    } else {
      const nearness = t < 0.25 ? (0.25 - t) / 0.25 : (t - 0.75) / 0.25
      scene.background = new THREE.Color().setHSL(0.63, 0.65, 0.04 + nearness * 0.06)
    }
  })

  return (
    <>
      <ambientLight ref={ambRef} intensity={0.5} />
      <directionalLight ref={dirRef} castShadow position={[30, 50, 40]} intensity={0.8}
        shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
    </>
  )
}

// ─── Night overlay (地面夜晚随日照变暗) ────────────────────────────────────

function NightOverlay() {
  const { state } = useSimulation()
  const ref = React.useRef<THREE.Mesh>(null)
  const dayRef = React.useRef(state.dayTime)
  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])

  useFrame(() => {
    if (!ref.current) return
    const t = dayRef.current
    const mat = ref.current.material as THREE.MeshBasicMaterial
    let opacity = 0
    if (t >= 0.25 && t <= 0.75) {
      // 白天：正午最亮，黎明/黄昏略暗
      const sun = Math.sin(((t - 0.25) / 0.5) * Math.PI)
      opacity = (1 - sun) * 0.18
    } else {
      // 夜晚：越靠近午夜越暗
      const n = t < 0.25 ? (0.25 - t) / 0.25 : (t - 0.75) / 0.25
      opacity = 0.18 + n * 0.52   // 黄昏0.18 → 午夜0.70
    }
    mat.opacity = Math.min(0.70, opacity)
  })

  return (
    // renderOrder=999：最后渲染，盖在所有物体之上
    // depthTest=false：不受深度测试影响，均匀覆盖整个画面
    // raycast=()=>{}：不参与射线检测，点击穿透
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} renderOrder={999} raycast={() => {}}>
      <planeGeometry args={[400, 400]} />
      <meshBasicMaterial color="#00061a" transparent opacity={0} depthTest={false} depthWrite={false} />
    </mesh>
  )
}

// ─── Animated character base ───────────────────────────────────────────────

function useCharacterAnim(x: number, y: number) {
  const ref = React.useRef<THREE.Group>(null)
  const animRef = React.useRef({
    startX: x, startY: y, targetX: x, targetY: y,
    elapsedMs: SIM_TICK_MS, initialized: false,
    time: 0, facing: 0,
  })
  React.useEffect(() => {
    const a = animRef.current
    if (!a.initialized) {
      a.startX = x; a.startY = y; a.targetX = x; a.targetY = y
      a.elapsedMs = SIM_TICK_MS; a.initialized = true
      if (ref.current) ref.current.position.set(x, 0, y)
      return
    }
    a.startX = ref.current?.position.x ?? a.targetX
    a.startY = ref.current?.position.z ?? a.targetY
    a.targetX = x; a.targetY = y; a.elapsedMs = 0
  }, [x, y])
  return { ref, animRef }
}

// ─── Migrant on horseback ─────────────────────────────────────────────────

function MigrantHorse({ x, y }: { x: number; y: number }) {
  const { ref, animRef } = useCharacterAnim(x, y)
  const horseRef = React.useRef<THREE.Mesh>(null)
  const riderRef = React.useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (!ref.current) return
    const a = animRef.current; a.time += delta
    a.elapsedMs = Math.min(SIM_TICK_MS, a.elapsedMs + delta * 1000)
    const t = Math.min(1, a.elapsedMs / SIM_TICK_MS)
    ref.current.position.x = THREE.MathUtils.lerp(a.startX, a.targetX, t)
    ref.current.position.z = THREE.MathUtils.lerp(a.startY, a.targetY, t)
    const dx = a.targetX - a.startX; const dz = a.targetY - a.startY
    const moving = Math.abs(dx) + Math.abs(dz) > 0.001
    if (moving) { a.facing = THREE.MathUtils.lerp(a.facing, Math.atan2(dx, dz), Math.min(1, delta * 10)); ref.current.rotation.y = a.facing }
    const stride = moving ? Math.sin(a.time * 14) : 0
    const baseY = lerpTerrainY(a.startX, a.startY, a.targetX, a.targetY, t)
    ref.current.position.y = baseY + (moving ? 0.015 + Math.abs(stride) * 0.025 : 0)
    if (horseRef.current) horseRef.current.rotation.z = moving ? Math.sin(a.time * 14) * 0.05 : 0
    if (riderRef.current) { riderRef.current.position.y = 0.36 + (moving ? Math.cos(a.time * 14) * 0.018 : 0); riderRef.current.rotation.z = moving ? Math.sin(a.time * 7) * 0.04 : 0 }
  })

  return (
    <group ref={ref} position={[x, 0, y]}>
      <mesh ref={horseRef} position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.38, 0.22, 0.18]} />
        <meshStandardMaterial color={palette.character.horseBody} />
      </mesh>
      <mesh position={[0.2, 0.26, 0]} castShadow>
        <boxGeometry args={[0.12, 0.12, 0.12]} />
        <meshStandardMaterial color={palette.character.horseBody} />
      </mesh>
      <mesh position={[-0.06, 0.3, 0]}>
        <boxGeometry args={[0.16, 0.07, 0.18]} />
        <meshStandardMaterial color={palette.character.saddle} />
      </mesh>
      <mesh position={[0.26, 0.33, 0]} rotation={[0, 0, -0.2]}>
        <boxGeometry args={[0.08, 0.18, 0.04]} />
        <meshStandardMaterial color={palette.character.horseMane} />
      </mesh>
      <mesh ref={riderRef} position={[0, 0.36, 0]}>
        <capsuleGeometry args={[0.05, 0.15, 3, 8]} />
        <meshStandardMaterial color={palette.character.robe} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.045, 10, 10]} />
        <meshStandardMaterial color={palette.character.skin} />
      </mesh>
      <mesh position={[0, 0.57, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.09, 0.12, 6]} />
        <meshStandardMaterial color={palette.character.hat} />
      </mesh>
    </group>
  )
}

// ─── Commuting walker (on foot) ───────────────────────────────────────────

function CommutingWalker({ x, y, purpose, selected, onClick }: {
  x: number; y: number; purpose: 'toWork' | 'toHome' | 'toShop' | 'fromShop'; selected?: boolean; onClick?: (e: any) => void
}) {
  const { ref, animRef } = useCharacterAnim(x, y)
  const bodyRef = React.useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (!ref.current) return
    const a = animRef.current; a.time += delta
    a.elapsedMs = Math.min(SIM_TICK_MS, a.elapsedMs + delta * 1000)
    const t = Math.min(1, a.elapsedMs / SIM_TICK_MS)
    ref.current.position.x = THREE.MathUtils.lerp(a.startX, a.targetX, t)
    ref.current.position.z = THREE.MathUtils.lerp(a.startY, a.targetY, t)
    const dx = a.targetX - a.startX; const dz = a.targetY - a.startY
    const moving = Math.abs(dx) + Math.abs(dz) > 0.001
    if (moving) { a.facing = THREE.MathUtils.lerp(a.facing, Math.atan2(dx, dz), Math.min(1, delta * 10)); ref.current.rotation.y = a.facing }
    const stride = moving ? Math.sin(a.time * 10) : 0
    const baseY = lerpTerrainY(a.startX, a.startY, a.targetX, a.targetY, t)
    ref.current.position.y = baseY + (moving ? Math.abs(stride) * 0.012 : 0)
    if (bodyRef.current) bodyRef.current.rotation.z = moving ? Math.sin(a.time * 10) * 0.06 : 0
  })

  const robeColor = purpose === 'toWork' ? palette.character.robe : palette.character.robeAccent

  return (
    <group ref={ref} position={[x, 0, y]} onClick={onClick}>
      {/* 点击靶区：透明圆柱（不用 visible=false，否则 THREE.js 不参与射线检测） */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.38, 0.38, 0.62, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={bodyRef} position={[0, 0.19, 0]}>
        <capsuleGeometry args={[0.045, 0.2, 3, 8]} />
        <meshStandardMaterial color={robeColor} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshStandardMaterial color={palette.character.skin} />
      </mesh>
      <mesh position={[0, 0.48, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.075, 0.09, 6]} />
        <meshStandardMaterial color={palette.character.hat} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.14, 0.18, 20]} />
          <meshBasicMaterial color="#52c41a" />
        </mesh>
      )}
    </group>
  )
}

// ─── Resident avatar (stationary near house) ──────────────────────────────

function ResidentAvatar({ x, y, seed, selected, onClick }: {
  x: number; y: number; seed: number; selected?: boolean; onClick?: (e: any) => void
}) {
  const ox = Math.sin(seed) * 0.22; const oz = Math.cos(seed * 1.7) * 0.22
  const color = seed % 2 === 0 ? palette.character.robe : palette.character.robeAccent
  return (
    <group position={[x + ox, 0, y + oz]} onClick={onClick}>
      {/* 点击靶区（透明，非 visible=false） */}
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.52, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.17, 0]}>
        <capsuleGeometry args={[0.04, 0.12, 3, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.31, 0]}>
        <sphereGeometry args={[0.045, 10, 10]} />
        <meshStandardMaterial color={palette.character.skin} />
      </mesh>
      <mesh position={[0, 0.39, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.08, 0.08, 6]} />
        <meshStandardMaterial color={palette.character.hat} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.14, 0.18, 20]} />
          <meshBasicMaterial color="#52c41a" />
        </mesh>
      )}
    </group>
  )
}

// ─── Tile ─────────────────────────────────────────────────────────────────

function Tile({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <mesh position={[x, 0, y]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.98, 0.98]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

function TileInstances({ tiles }: { tiles: [number, number][] }) {
  const ref = React.useRef<THREE.InstancedMesh>(null)
  React.useLayoutEffect(() => {
    if (!ref.current) return
    const mesh = ref.current
    const temp = new THREE.Object3D()
    const color = new THREE.Color()
    mesh.count = tiles.length
    for (let i = 0; i < tiles.length; i++) {
      const [x, y] = tiles[i]
      temp.position.set(x, 0, y)
      temp.rotation.set(-Math.PI / 2, 0, 0)
      temp.scale.set(1, 1, 1)
      temp.updateMatrix()
      mesh.setMatrixAt(i, temp.matrix)
      color.set((x + y) % 2 === 0 ? palette.map.tileLight : palette.map.tileDark)
      mesh.setColorAt(i, color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [tiles])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(tiles.length, 1)]} frustumCulled={false}>
      <planeGeometry args={[0.98, 0.98]} />
      <meshBasicMaterial />
    </instancedMesh>
  )
}

function FlatInstances({
  items,
  y = 0,
  size = [1, 1] as [number, number],
  color,
  opacity = 1,
  rotationZ = 0,
}: {
  items: Array<{ x: number; y: number }>
  y?: number
  size?: [number, number]
  color: string
  opacity?: number
  rotationZ?: number
}) {
  const ref = React.useRef<THREE.InstancedMesh>(null)
  React.useLayoutEffect(() => {
    if (!ref.current) return
    const mesh = ref.current
    const temp = new THREE.Object3D()
    mesh.count = items.length
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      temp.position.set(item.x, y, item.y)
      temp.rotation.set(-Math.PI / 2, 0, rotationZ)
      temp.scale.set(1, 1, 1)
      temp.updateMatrix()
      mesh.setMatrixAt(i, temp.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [items, y, rotationZ])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(items.length, 1)]} frustumCulled={false}>
      <planeGeometry args={size} />
      <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} />
    </instancedMesh>
  )
}

// ─── Instanced circles (flat discs on the ground) ─────────────────────────

function CircleInstances({
  items,
  y = 0,
  radius = 0.1,
  color,
  opacity = 1,
}: {
  items: Array<{ x: number; y: number }>
  y?: number
  radius?: number
  color: string
  opacity?: number
}) {
  const ref = React.useRef<THREE.InstancedMesh>(null)
  React.useLayoutEffect(() => {
    if (!ref.current) return
    const mesh = ref.current
    const temp = new THREE.Object3D()
    mesh.count = items.length
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      temp.position.set(item.x, y, item.y)
      temp.rotation.set(-Math.PI / 2, 0, 0)
      temp.scale.set(1, 1, 1)
      temp.updateMatrix()
      mesh.setMatrixAt(i, temp.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [items, y])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(items.length, 1)]} frustumCulled={false}>
      <circleGeometry args={[radius, 10]} />
      <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} />
    </instancedMesh>
  )
}

// ─── Farm zone colour helpers ──────────────────────────────────────────────

// ─── Selection ring (solid halo under selected building / citizen) ────────

function SelectionRingMesh({ x, y, color = '#faad14', r = 0.52 }: {
  x: number; y: number; color?: string; r?: number
}) {
  return (
    <group>
      {/* outer glow */}
      <mesh position={[x, 0.04, y]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.55, r * 1.22, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} />
      </mesh>
      {/* main bright ring */}
      <mesh position={[x, 0.07, y]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.70, r, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.92} depthWrite={false} />
      </mesh>
    </group>
  )
}

// ─── Peddler mesh (游商：市场行商，肩挑货担沿路叫卖) ─────────────────────

function PeddlerMesh({ x, y }: { x: number; y: number }) {
  const { ref, animRef } = useCharacterAnim(x, y)

  useFrame((_, delta) => {
    if (!ref.current) return
    const a = animRef.current; a.time += delta
    a.elapsedMs = Math.min(SIM_TICK_MS, a.elapsedMs + delta * 1000)
    const t = Math.min(1, a.elapsedMs / SIM_TICK_MS)
    ref.current.position.x = THREE.MathUtils.lerp(a.startX, a.targetX, t)
    ref.current.position.z = THREE.MathUtils.lerp(a.startY, a.targetY, t)
    ref.current.position.y = lerpTerrainY(a.startX, a.startY, a.targetX, a.targetY, t)
    const dx = a.targetX - a.startX, dz = a.targetY - a.startY
    if (Math.abs(dx) + Math.abs(dz) > 0.001) {
      a.facing = THREE.MathUtils.lerp(a.facing, Math.atan2(dx, dz), Math.min(1, delta * 10))
      ref.current.rotation.y = a.facing
    }
    // carrying-pole bob
    ref.current.position.y += Math.sin(a.time * 7) * 0.012
  })

  return (
    <group ref={ref} position={[x, 0, y]} castShadow>
      {/* 身体（棕色长袍） */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <capsuleGeometry args={[0.054, 0.15, 3, 8]} />
        <meshStandardMaterial color="#9c5c20" />
      </mesh>
      {/* 头 */}
      <mesh position={[0, 0.37, 0]}>
        <sphereGeometry args={[0.046, 8, 8]} />
        <meshStandardMaterial color={palette.character.skin} />
      </mesh>
      {/* 斗笠 */}
      <mesh position={[0, 0.43, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.09, 0.08, 8]} />
        <meshStandardMaterial color="#6b4010" />
      </mesh>
      {/* 扁担 */}
      <mesh position={[0, 0.30, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.011, 0.011, 0.52, 4]} />
        <meshStandardMaterial color="#8b5e2a" />
      </mesh>
      {/* 左篮 */}
      <mesh position={[-0.26, 0.18, 0]}>
        <cylinderGeometry args={[0.063, 0.05, 0.1, 8]} />
        <meshStandardMaterial color="#c8a050" />
      </mesh>
      {/* 右篮 */}
      <mesh position={[0.26, 0.18, 0]}>
        <cylinderGeometry args={[0.063, 0.05, 0.1, 8]} />
        <meshStandardMaterial color="#c8a050" />
      </mesh>
    </group>
  )
}

function getFarmColor(cropType: string, progress: number): THREE.Color {
  // Stage 0: bare soil just sown
  if (progress < 0.08) return new THREE.Color('#9a7850')
  // Stage 1: seedling
  if (progress < 0.38) return new THREE.Color('#7acc48')
  // Stage 2: growing – crop-tinted
  if (progress < 0.72) {
    const mid: Record<string, string> = {
      rice: '#3a9030', millet: '#6a9820', wheat: '#8a8e20', soybean: '#2a8440', vegetable: '#1a7030',
    }
    return new THREE.Color(mid[cropType] ?? '#3a9030')
  }
  // Stage 3: ready to harvest
  const ripe: Record<string, string> = {
    rice: '#e8c040', millet: '#e09028', wheat: '#c8a028', soybean: '#b8b838', vegetable: '#208020',
  }
  return new THREE.Color(ripe[cropType] ?? '#e8c040')
}

// ─── Farm zone instanced tile mesh (per-zone colour) ──────────────────────

function FarmZoneInstances({ zones }: { zones: Array<{ x: number; y: number; cropType: string; growthProgress: number }> }) {
  const ref = React.useRef<THREE.InstancedMesh>(null)
  const items = React.useMemo(() => {
    const out: Array<{ x: number; y: number; color: THREE.Color }> = []
    for (const z of zones) {
      const col = getFarmColor(z.cropType, z.growthProgress)
      for (let dx = 0; dx <= 1; dx++)
        for (let dy = 0; dy <= 1; dy++)
          out.push({ x: z.x + dx, y: z.y + dy, color: col })
    }
    return out
  }, [zones])

  React.useLayoutEffect(() => {
    if (!ref.current || items.length === 0) return
    const mesh = ref.current
    const tmp = new THREE.Object3D()
    mesh.count = items.length
    for (let i = 0; i < items.length; i++) {
      tmp.position.set(items[i].x, 0.062, items[i].y)
      tmp.rotation.set(-Math.PI / 2, 0, 0)
      tmp.scale.set(1, 1, 1)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
      mesh.setColorAt(i, items[i].color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [items])

  if (items.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(items.length, 1)]} frustumCulled={false}>
      <planeGeometry args={[0.96, 0.96]} />
      <meshBasicMaterial />
    </instancedMesh>
  )
}

// ─── Farmer at work (in the field) ────────────────────────────────────────

function FarmerAtWork({ x, y, seed, selected, onClick }: {
  x: number; y: number; seed: number; selected?: boolean; onClick?: (e: any) => void
}) {
  const bodyRef = React.useRef<THREE.Group>(null)
  const timeRef = React.useRef(seed * 0.7)

  useFrame((_, delta) => {
    timeRef.current += delta
    if (bodyRef.current) {
      // Slow bending animation simulating hoeing
      bodyRef.current.rotation.x = -0.28 + Math.sin(timeRef.current * 1.4) * 0.12
    }
  })

  // Spread farmers within the 2×2 zone
  const ox = Math.sin(seed * 0.73) * 0.55
  const oz = Math.cos(seed * 1.31) * 0.55

  return (
    <group position={[x + ox, 0, y + oz]} onClick={onClick}>
      {/* 点击靶区（透明，非 visible=false） */}
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.46, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* Farmer body (bent forward) */}
      <group ref={bodyRef} rotation={[-0.28, 0, 0]}>
        <mesh position={[0, 0.15, 0]}>
          <capsuleGeometry args={[0.042, 0.13, 3, 8]} />
          <meshStandardMaterial color="#7c9a50" />
        </mesh>
        <mesh position={[0, 0.30, 0]}>
          <sphereGeometry args={[0.043, 10, 10]} />
          <meshStandardMaterial color={palette.character.skin} />
        </mesh>
        {/* Wide straw hat brim */}
        <mesh position={[0, 0.36, 0]}>
          <cylinderGeometry args={[0.13, 0.14, 0.035, 10]} />
          <meshStandardMaterial color="#c8a838" />
        </mesh>
        {/* Hat crown */}
        <mesh position={[0, 0.40, 0]}>
          <cylinderGeometry args={[0.058, 0.068, 0.09, 8]} />
          <meshStandardMaterial color="#c8a838" />
        </mesh>
        {/* Hoe handle */}
        <mesh position={[0.09, 0.12, -0.14]} rotation={[0.65, 0.15, 0]}>
          <boxGeometry args={[0.018, 0.24, 0.018]} />
          <meshStandardMaterial color="#7a4020" />
        </mesh>
        {/* Hoe blade */}
        <mesh position={[0.09, 0.01, 0.02]} rotation={[0.8, 0, 0]}>
          <boxGeometry args={[0.12, 0.022, 0.022]} />
          <meshStandardMaterial color="#909090" />
        </mesh>
      </group>
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.14, 0.18, 20]} />
          <meshBasicMaterial color="#52c41a" />
        </mesh>
      )}
    </group>
  )
}

// ─── Bridge (桥梁) ─────────────────────────────────────────────────────────

function BridgeInstances({ bridges }: { bridges: Array<{ x: number; y: number }> }) {
  // 护栏位置：河道主要沿 x 流向，桥横跨 y 方向，护栏贴两侧边缘
  const railNeg = React.useMemo(() => bridges.map(b => ({ x: b.x, y: b.y - 0.43 })), [bridges])
  const railPos = React.useMemo(() => bridges.map(b => ({ x: b.x, y: b.y + 0.43 })), [bridges])
  if (bridges.length === 0) return null
  return (
    <>
      {/* 桥面木板底色 */}
      <FlatInstances items={bridges} y={0.058} size={[0.96, 0.96]} color={palette.map.bridgeDeck} />
      {/* 横向木板条纹 */}
      <FlatInstances items={bridges} y={0.062} size={[0.82, 0.11]} color={palette.map.bridgePlank} opacity={0.75} />
      {/* 两侧护栏 */}
      <FlatInstances items={railNeg} y={0.07} size={[0.9, 0.07]} color={palette.map.bridgeRail} />
      <FlatInstances items={railPos} y={0.07} size={[0.9, 0.07]} color={palette.map.bridgeRail} />
    </>
  )
}

function RoadInstances({ roads }: { roads: Array<{ x: number; y: number }> }) {
  const normalRoads = React.useMemo(() => roads.filter(r => !(r.y === 0 && r.x <= -6)), [roads])
  const mountainRoads = React.useMemo(() => normalRoads.filter(r => isMountainAt(r.x, r.y)), [normalRoads])
  const flatRoads = React.useMemo(() => normalRoads.filter(r => !isMountainAt(r.x, r.y)), [normalRoads])
  const highwayRoads = React.useMemo(() => roads.filter(r => r.y === 0 && r.x <= -6), [roads])
  // Mountain road items at their actual terrain height (not fixed y)
  const mtnRoadItems   = React.useMemo(() => mountainRoads.map(r => ({ x: r.x, y: r.y, h: tileH(r.x, r.y) + 0.010 })), [mountainRoads])
  const mtnStripeItems = React.useMemo(() => mountainRoads.map(r => ({ x: r.x, y: r.y, h: tileH(r.x, r.y) + 0.014 })), [mountainRoads])
  return (
    <>
      {flatRoads.length > 0 && <FlatInstances items={flatRoads} y={0.05} size={[0.98, 0.98]} color={palette.map.road} />}
      {mtnRoadItems.length > 0 && (
        <>
          {/* mountain roads sit on the terrain surface, not at a fixed y */}
          <VariableHeightFlatInstances items={mtnRoadItems}   size={[0.98, 0.98]} color={palette.map.mountainRoad} />
          <VariableHeightFlatInstances items={mtnStripeItems} size={[0.32, 0.32]} color={palette.map.roadDust} opacity={0.9} />
        </>
      )}
      {highwayRoads.length > 0 && (
        <>
          <FlatInstances items={highwayRoads} y={0.042} size={[1.22, 1.22]} color={palette.map.highwayEdge} />
          <FlatInstances items={highwayRoads} y={0.048} size={[0.94, 0.94]} color={palette.map.highway} />
          <FlatInstances items={highwayRoads.map(r => ({ x: r.x, y: r.y - 0.18 }))} y={0.052} size={[0.2, 0.7]} color={palette.map.roadDust} />
          <FlatInstances items={highwayRoads.map(r => ({ x: r.x, y: r.y + 0.18 }))} y={0.052} size={[0.2, 0.7]} color={palette.map.roadDust} />
        </>
      )}
    </>
  )
}

function TerrainSuitabilityMark({ x, y, suitable }: { x: number; y: number; suitable: boolean }) {
  // Removed circular arable markers per user request. Keep only a subtle cross for unsuitable tiles.
  if (suitable) return null
  return (
    <group position={[x, 0.012, y]}>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[0.14, 0.03]} />
        <meshBasicMaterial color={palette.map.barrenMark} transparent opacity={0.82} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
        <planeGeometry args={[0.14, 0.03]} />
        <meshBasicMaterial color={palette.map.barrenMark} transparent opacity={0.82} />
      </mesh>
    </group>
  )
}

// ─── Mountain height helper ────────────────────────────────────────────────
// tileH maps the Diamond-Square normalised value [0,1] → visual geometry height [0.04, 0.28]
function tileH(x: number, y: number): number {
  const BASE = 0.04
  const SCALE = worldGenConfig.mountain.tileScale
  return BASE + getMountainHeight(x, y) * SCALE
}
const _MAX_MOUNTAIN_H = 0.04 + worldGenConfig.mountain.tileScale

/**
 * Returns the lerped terrain Y for a character moving from (sx,sz) to (tx,tz) at param t.
 * Interpolates between the two tile heights so characters glide smoothly up/down mountains.
 */
function lerpTerrainY(sx: number, sz: number, tx: number, tz: number, t: number): number {
  const sh = isMountainAt(Math.round(sx), Math.round(sz)) ? tileH(Math.round(sx), Math.round(sz)) : 0
  const eh = isMountainAt(Math.round(tx), Math.round(tz)) ? tileH(Math.round(tx), Math.round(tz)) : 0
  return sh + (eh - sh) * t
}

// ─── 3-D Mountain terrain (instanced rock boxes + optional snow caps) ──────

function MountainInstances({ tiles }: { tiles: [number, number][] }) {
  const mainRef = React.useRef<THREE.InstancedMesh>(null)

  const mainData = React.useMemo(() => {
    const main: { x: number; y: number; h: number }[] = []
    for (const [x, y] of tiles) {
      const h = tileH(x, y)
      main.push({ x, y, h })
    }
    return main
  }, [tiles])

  // remove snow caps: we no longer render separate snow instances

  React.useLayoutEffect(() => {
    if (!mainRef.current || mainData.length === 0) return
    const mesh = mainRef.current
    const temp = new THREE.Object3D()
    const color = new THREE.Color()
    mesh.count = mainData.length
    for (let i = 0; i < mainData.length; i++) {
      const { x, y, h } = mainData[i]
      temp.position.set(x, h * 0.5, y)
      temp.scale.set(0.97, h, 0.97)
      temp.rotation.set(0, 0, 0)
      temp.updateMatrix()
      mesh.setMatrixAt(i, temp.matrix)
      const t2 = h / _MAX_MOUNTAIN_H
      const noise = 0.88 + (Math.abs((x * 7 + y * 13) % 14)) / 100
      color.setRGB((0.44 - t2 * 0.10) * noise, (0.38 - t2 * 0.07) * noise, (0.32 - t2 * 0.03) * noise)
      mesh.setColorAt(i, color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [mainData])


  if (tiles.length === 0) return null
  return (
    <>
      <instancedMesh ref={mainRef} args={[undefined, undefined, Math.max(mainData.length, 1)]}
        frustumCulled={false} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.95} metalness={0.05} />
      </instancedMesh>
    </>
  )
}

// ─── Smooth river ribbon mesh (built once from pre-computed curve geometry) 
// The Catmull-Rom ribbon is computed at module level; this component just
// attaches it to the scene so bends look perfectly smooth at every zoom level.

const _riverRibbonGeo: THREE.BufferGeometry | null = (() => {
  if (!RIVER_CURVE) return null
  const WATER_Y = 0.030, WIDTH = 2.15
  // increase sampling for smoother ribbon (was *8)
  const SAMPLES = Math.max( Math.floor(RIVER_CENTER_LINE.length * 12 * ( (MAP_SIZE_X * MAP_SIZE_Y) / (120 * 90) )), 48 ) // scale sampling to map size, min 48
  // sample curve points and use curve tangents for stable local normals
  const cpts = RIVER_CURVE.getPoints(SAMPLES)
  const pos: number[] = [], uvs: number[] = [], idx: number[] = []
  for (let i = 0; i < cpts.length; i++) {
    const p = cpts[i]
    const u = i / (cpts.length - 1)
    // use curve tangent rather than discrete next-prev diff
    const tan = RIVER_CURVE.getTangent(u)
    const tx = tan.x, tz = tan.z
    const len = Math.sqrt(tx * tx + tz * tz) || 1
    const px = -tz / len, pz = tx / len
    pos.push(p.x + px * WIDTH * 0.5, WATER_Y, p.z + pz * WIDTH * 0.5,
             p.x - px * WIDTH * 0.5, WATER_Y, p.z - pz * WIDTH * 0.5)
    uvs.push(u, 0, u, 1)
    if (i < cpts.length - 1) { const b = i * 2; idx.push(b, b+1, b+2, b+1, b+3, b+2) }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
})()

function SmoothRiverMesh() {
  if (!_riverRibbonGeo) return null
  return (
    <mesh geometry={_riverRibbonGeo} frustumCulled={false} renderOrder={1}>
      <meshBasicMaterial color={palette.map.river} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

// ─── Animated flowing water foam ──────────────────────────────────────────
// Renders diagonal stripes that scroll across every water tile each frame,
// giving the impression of flowing current without a texture atlas.

function AnimatedRiverFoam({ tiles }: { tiles: Array<{ x: number; y: number }> }) {
  const ref1 = React.useRef<THREE.InstancedMesh>(null)
  const ref2 = React.useRef<THREE.InstancedMesh>(null)
  const timeRef = React.useRef(0)
  const n = tiles.length

  // We keep two offset sets (phase 0 and phase 0.5) so there's always a stripe visible
  const update = React.useCallback((t: number) => {
    for (const [ref, phaseOffset] of [[ref1, 0], [ref2, 0.5]] as const) {
      const mesh = ref.current
      if (!mesh || n === 0) continue
      const temp = new THREE.Object3D()
      for (let i = 0; i < n; i++) {
        const { x, y } = tiles[i]
        // Each tile has a local phase so stripes appear to flow
        const phase = ((t * 0.35 + phaseOffset + (x + y) * 0.08) % 1) - 0.5
        temp.position.set(x + phase * 0.55, 0.034, y + phase * 0.15)
        temp.rotation.set(-Math.PI / 2, 0, Math.PI / 5.5)  // ~33° diagonal
        temp.scale.set(1, 1, 1)
        temp.updateMatrix()
        mesh.setMatrixAt(i, temp.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
  }, [tiles, n])

  React.useLayoutEffect(() => {
    if (ref1.current) ref1.current.count = n
    if (ref2.current) ref2.current.count = n
    update(0)
  }, [tiles, n, update])

  useFrame((_, delta) => {
    timeRef.current += delta
    update(timeRef.current)
  })

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

// ─── Placement ghost preview ──────────────────────────────────────────────

function PlacementGhost({ tool, stateRef, mouseNDCRef, mouseOnCanvasRef }: {
  tool: Tool
  stateRef: React.RefObject<CityState>
  mouseNDCRef: React.RefObject<{ x: number; y: number }>
  mouseOnCanvasRef: React.RefObject<boolean>
}) {
  const { camera } = useThree()
  const buildingRef = React.useRef<THREE.Mesh>(null)
  const farmRef = React.useRef<THREE.Mesh>(null)
  const raycaster = React.useRef(new THREE.Raycaster())
  const plane = React.useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const hit = React.useRef(new THREE.Vector3())

  const isBuildingTool = ALL_BUILDING_TYPES.includes(tool as BuildingType)
  const isFarmTool = tool === 'farmZone'

  useFrame(() => {
    const show = mouseOnCanvasRef.current && (isBuildingTool || isFarmTool)
    if (!show) {
      if (buildingRef.current) buildingRef.current.visible = false
      if (farmRef.current) farmRef.current.visible = false
      return
    }
    raycaster.current.setFromCamera(mouseNDCRef.current as any, camera as THREE.Camera)
    if (!raycaster.current.ray.intersectPlane(plane.current, hit.current)) {
      if (buildingRef.current) buildingRef.current.visible = false
      if (farmRef.current) farmRef.current.visible = false
      return
    }
    const tx = Math.round(hit.current.x), ty = Math.round(hit.current.z)
    const s = stateRef.current
    if (!s) return

    if (isBuildingTool) {
      const mesh = buildingRef.current; if (!mesh) return
      const bt = tool as BuildingType
      // Compute effective cost (mountain builds cost more)
      const isMtn = isMountainAt(tx, ty)
      const mountainMultiplier = (worldGenConfig.building && worldGenConfig.building.mountainMultiplier) || 1
      const effectiveCost = Math.ceil(BUILDING_COST[bt] * (isMtn ? mountainMultiplier : 1))
      const valid =
        s.money >= effectiveCost &&
        !isRiverAt(tx, ty) &&
        !s.buildings.some(b => b.x === tx && b.y === ty) &&
        !s.roads.some(r => r.x === tx && r.y === ty) &&
        !s.farmZones.some(z => z.x === tx && z.y === ty) &&
        (bt !== 'mine' || isOreVeinAt(tx, ty))
      // Hover above terrain surface (mountain or flat ground)
      const baseY = isMtn ? tileH(tx, ty) : 0
      mesh.position.set(tx, baseY + 0.32, ty)
      mesh.visible = true
      ;(mesh.material as THREE.MeshBasicMaterial).color.set(valid ? '#52c41a' : '#ff4d4f')
    }

    if (isFarmTool) {
      const mesh = farmRef.current; if (!mesh) return
      const fp = [{ x: tx, y: ty }, { x: tx + 1, y: ty }, { x: tx, y: ty + 1 }, { x: tx + 1, y: ty + 1 }]
      const allClear = fp.every(t =>
        !isRiverAt(t.x, t.y) &&
        !isMountainAt(t.x, t.y) &&
        !s.buildings.some(b => b.x === t.x && b.y === t.y) &&
        !s.roads.some(r => r.x === t.x && r.y === t.y) &&
        !s.farmZones.some(z => t.x >= z.x && t.x <= z.x + 1 && t.y >= z.y && t.y <= z.y + 1)
      )
      const nearRiver = fp.some(t => isNearRiverFive(t.x, t.y))
      const valid = allClear && nearRiver
      mesh.position.set(tx + 0.5, 0.016, ty + 0.5)
      mesh.visible = true
      ;(mesh.material as THREE.MeshBasicMaterial).color.set(valid ? '#52c41a' : '#ff4d4f')
    }
  })

  if (!isBuildingTool && !isFarmTool) return null
  return (
    <group>
      {isBuildingTool && (
        <mesh ref={buildingRef} visible={false}>
          <boxGeometry args={[0.88, 0.55, 0.88]} />
          <meshBasicMaterial transparent opacity={0.42} depthWrite={false} />
        </mesh>
      )}
      {isFarmTool && (
        <mesh ref={farmRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <planeGeometry args={[1.96, 1.96]} />
          <meshBasicMaterial transparent opacity={0.45} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

// ─── Farm pile (收获堆，等待牛车来取) ──────────────────────────────────────

function FarmPileInstances({ piles }: { piles: Array<{ x: number; y: number; cropType?: string }> }) {
  if (piles.length === 0) return null
  const PILE_COLOR: Record<string, string> = {
    rice: '#d4a820', millet: '#d89030', wheat: '#c89028', soybean: '#b0b840', vegetable: '#60a040',
  }
  return (
    <group>
      {piles.map((p, i) => {
        const col = PILE_COLOR[(p as any).cropType ?? 'rice'] ?? '#d4a820'
        return (
          <group key={i} position={[p.x + 0.5, 0.065, p.y - 0.1]}>
            {/* 草堆底座 */}
            <mesh position={[0, 0.1, 0]} castShadow>
              <cylinderGeometry args={[0.2, 0.26, 0.16, 8]} />
              <meshStandardMaterial color={col} />
            </mesh>
            {/* 草堆顶部 */}
            <mesh position={[0, 0.24, 0]}>
              <coneGeometry args={[0.16, 0.18, 8]} />
              <meshStandardMaterial color={col} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

// ─── Ox cart (粮仓牛车) ─────────────────────────────────────────────────────

function OxCartMesh({ x, y, loaded }: { x: number; y: number; loaded: boolean }) {
  const { ref, animRef } = useCharacterAnim(x, y)

  useFrame((_, delta) => {
    if (!ref.current) return
    const a = animRef.current; a.time += delta
    a.elapsedMs = Math.min(SIM_TICK_MS, a.elapsedMs + delta * 1000)
    const t = Math.min(1, a.elapsedMs / SIM_TICK_MS)
    ref.current.position.x = THREE.MathUtils.lerp(a.startX, a.targetX, t)
    ref.current.position.z = THREE.MathUtils.lerp(a.startY, a.targetY, t)
    ref.current.position.y = lerpTerrainY(a.startX, a.startY, a.targetX, a.targetY, t)
    const dx = a.targetX - a.startX; const dz = a.targetY - a.startY
    if (Math.abs(dx) + Math.abs(dz) > 0.001) {
      a.facing = THREE.MathUtils.lerp(a.facing, Math.atan2(dx, dz), Math.min(1, delta * 8))
      ref.current.rotation.y = a.facing
    }
  })

  return (
    <group ref={ref} position={[x, 0, y]}>
      {/* 牛身 */}
      <mesh position={[0, 0.18, 0.1]} castShadow>
        <boxGeometry args={[0.22, 0.2, 0.42]} />
        <meshStandardMaterial color="#5a3a20" />
      </mesh>
      {/* 牛头 */}
      <mesh position={[0, 0.22, 0.36]}>
        <boxGeometry args={[0.16, 0.16, 0.18]} />
        <meshStandardMaterial color="#5a3a20" />
      </mesh>
      {/* 犄角 */}
      <mesh position={[-0.1, 0.32, 0.36]} rotation={[0, 0, 0.5]}>
        <cylinderGeometry args={[0.01, 0.015, 0.1, 5]} />
        <meshStandardMaterial color="#d8c090" />
      </mesh>
      <mesh position={[0.1, 0.32, 0.36]} rotation={[0, 0, -0.5]}>
        <cylinderGeometry args={[0.01, 0.015, 0.1, 5]} />
        <meshStandardMaterial color="#d8c090" />
      </mesh>
      {/* 车架 */}
      <mesh position={[0, 0.08, -0.15]}>
        <boxGeometry args={[0.36, 0.05, 0.44]} />
        <meshStandardMaterial color="#7a4a20" />
      </mesh>
      {/* 车轮左 */}
      <mesh position={[-0.2, 0.09, -0.12]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.1, 0.04, 10]} />
        <meshStandardMaterial color="#4a2a10" />
      </mesh>
      {/* 车轮右 */}
      <mesh position={[0.2, 0.09, -0.12]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.1, 0.04, 10]} />
        <meshStandardMaterial color="#4a2a10" />
      </mesh>
      {/* 货物（稻草捆，仅装载时显示） */}
      {loaded && (
        <mesh position={[0, 0.2, -0.15]}>
          <boxGeometry args={[0.3, 0.18, 0.36]} />
          <meshStandardMaterial color="#d4a820" />
        </mesh>
      )}
    </group>
  )
}

// ─── Market buyer / 行商 ────────────────────────────────────────────────────

function MarketBuyerMesh({ x, y, loaded }: { x: number; y: number; loaded: boolean }) {
  const { ref, animRef } = useCharacterAnim(x, y)
  const bodyRef = React.useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (!ref.current) return
    const a = animRef.current; a.time += delta
    a.elapsedMs = Math.min(SIM_TICK_MS, a.elapsedMs + delta * 1000)
    const t = Math.min(1, a.elapsedMs / SIM_TICK_MS)
    ref.current.position.x = THREE.MathUtils.lerp(a.startX, a.targetX, t)
    ref.current.position.z = THREE.MathUtils.lerp(a.startY, a.targetY, t)
    const dx = a.targetX - a.startX; const dz = a.targetY - a.startY
    const moving = Math.abs(dx) + Math.abs(dz) > 0.001
    if (moving) { a.facing = THREE.MathUtils.lerp(a.facing, Math.atan2(dx, dz), Math.min(1, delta * 10)); ref.current.rotation.y = a.facing }
    const baseY = lerpTerrainY(a.startX, a.startY, a.targetX, a.targetY, t)
    ref.current.position.y = baseY + (moving ? Math.abs(Math.sin(a.time * 9)) * 0.01 : 0)
    if (bodyRef.current) bodyRef.current.rotation.z = moving ? Math.sin(a.time * 9) * 0.05 : 0
  })

  return (
    <group ref={ref} position={[x, 0, y]}>
      {/* 扁担 */}
      <mesh position={[0, 0.32, 0]} rotation={[0, 0, 0.1]}>
        <boxGeometry args={[0.45, 0.018, 0.018]} />
        <meshStandardMaterial color="#7a4a1a" />
      </mesh>
      {/* 左侧货篓 */}
      <mesh position={[-0.22, 0.22, 0]}>
        <boxGeometry args={[0.1, 0.12, 0.1]} />
        <meshStandardMaterial color={loaded ? '#d4a820' : '#8b6020'} />
      </mesh>
      {/* 右侧货篓 */}
      <mesh position={[0.22, 0.22, 0]}>
        <boxGeometry args={[0.1, 0.12, 0.1]} />
        <meshStandardMaterial color={loaded ? '#d4a820' : '#8b6020'} />
      </mesh>
      {/* 身体 */}
      <mesh ref={bodyRef} position={[0, 0.18, 0]}>
        <capsuleGeometry args={[0.042, 0.14, 3, 8]} />
        <meshStandardMaterial color="#7a5030" />
      </mesh>
      {/* 头 */}
      <mesh position={[0, 0.34, 0]}>
        <sphereGeometry args={[0.044, 10, 10]} />
        <meshStandardMaterial color={palette.character.skin} />
      </mesh>
      {/* 斗笠 */}
      <mesh position={[0, 0.40, 0]}>
        <cylinderGeometry args={[0.11, 0.13, 0.03, 9]} />
        <meshStandardMaterial color="#b8902a" />
      </mesh>
    </group>
  )
}

// ─── Building meshes (宋朝低模) ────────────────────────────────────────────

function HouseMesh({ x, y, occupants }: { x: number; y: number; occupants: number }) {
  // snap visual to mountain height if present so houses on peaks don't overlap
  const baseY = isMountainAt(x, y) ? tileH(x, y) : 0
  return (
    <group position={[x, baseY, y]}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[0.8, 0.7, 0.8]} />
        <meshStandardMaterial color={palette.building.houseBody} />
      </mesh>
      <mesh position={[0, 0.85, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.7, 0.55, 4]} />
        <meshStandardMaterial color={palette.building.houseRoof} />
      </mesh>
      <mesh position={[0.3, 0.4, 0.3]}>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshStandardMaterial color={occupants > 0 ? '#fff' : '#555'} />
      </mesh>
    </group>
  )
}

function MarketMesh({ x, y }: { x: number; y: number }) {
  const baseY = isMountainAt(x, y) ? tileH(x, y) : 0
  return (
    <group position={[x, baseY, y]}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[0.9, 0.5, 0.9]} />
        <meshStandardMaterial color={palette.building.marketBody} />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <boxGeometry args={[0.9, 0.14, 0.1]} />
        <meshStandardMaterial color={palette.building.marketAccent} />
      </mesh>
    </group>
  )
}

function TeahouseMesh({ x, y }: { x: number; y: number }) {
  return (
    <group position={[x, 0, y]}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.82, 0.6, 0.82]} />
        <meshStandardMaterial color={palette.building.teahouseBody} />
      </mesh>
      <mesh position={[0, 0.75, 0]} rotation={[0, Math.PI / 8, 0]}>
        <coneGeometry args={[0.65, 0.5, 8]} />
        <meshStandardMaterial color={palette.building.teahouseRoof} />
      </mesh>
      {/* Lantern */}
      <mesh position={[0.1, 0.85, 0.1]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#ff4400" emissive="#ff2200" emissiveIntensity={0.8} />
      </mesh>
    </group>
  )
}

function TavernMesh({ x, y }: { x: number; y: number }) {
  return (
    <group position={[x, 0, y]}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.9, 0.6, 0.9]} />
        <meshStandardMaterial color={palette.building.tavernBody} />
      </mesh>
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[1.0, 0.12, 0.12]} />
        <meshStandardMaterial color={palette.building.tavernBanner} />
      </mesh>
      {/* Sign post */}
      <mesh position={[0.5, 0.55, 0]}>
        <boxGeometry args={[0.04, 0.5, 0.04]} />
        <meshStandardMaterial color="#5a3010" />
      </mesh>
    </group>
  )
}

function BlacksmithMesh({ x, y }: { x: number; y: number }) {
  const baseY = isMountainAt(x, y) ? tileH(x, y) : 0
  return (
    <group position={[x, baseY, y]}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[0.85, 0.44, 0.85]} />
        <meshStandardMaterial color={palette.building.blacksmithBody} />
      </mesh>
      {/* chimney */}
      <mesh position={[0.25, 0.65, 0.25]} castShadow>
        <boxGeometry args={[0.18, 0.5, 0.18]} />
        <meshStandardMaterial color={palette.building.blacksmithChimney} />
      </mesh>
      {/* forge glow */}
      <mesh position={[0, 0.18, 0.45]}>
        <boxGeometry args={[0.3, 0.22, 0.04]} />
        <meshStandardMaterial color="#ff6600" emissive="#ff4400" emissiveIntensity={0.7} />
      </mesh>
    </group>
  )
}

function MineMesh({ x, y }: { x: number; y: number }) {
  const baseY = isMountainAt(x, y) ? tileH(x, y) : 0
  return (
    <group position={[x, baseY, y]}>
      {/* 矿洞主体 — 深灰石块 */}
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.9, 0.36, 0.9]} />
        <meshStandardMaterial color="#6b5a4e" roughness={0.95} />
      </mesh>
      {/* 矿洞入口 */}
      <mesh position={[0, 0.18, 0.46]}>
        <boxGeometry args={[0.38, 0.3, 0.04]} />
        <meshStandardMaterial color="#1a1008" />
      </mesh>
      {/* 矿石堆 — 暗红铁矿色 */}
      <mesh position={[-0.28, 0.08, -0.28]} castShadow>
        <boxGeometry args={[0.26, 0.16, 0.26]} />
        <meshStandardMaterial color="#7a3a2a" roughness={1} />
      </mesh>
      {/* 木架支撑 */}
      <mesh position={[0, 0.42, 0.44]} castShadow>
        <boxGeometry args={[0.5, 0.06, 0.06]} />
        <meshStandardMaterial color="#8b6914" />
      </mesh>
      <mesh position={[-0.22, 0.3, 0.44]} castShadow>
        <boxGeometry args={[0.06, 0.3, 0.06]} />
        <meshStandardMaterial color="#8b6914" />
      </mesh>
      <mesh position={[0.22, 0.3, 0.44]} castShadow>
        <boxGeometry args={[0.06, 0.3, 0.06]} />
        <meshStandardMaterial color="#8b6914" />
      </mesh>
    </group>
  )
}

function TempleMesh({ x, y }: { x: number; y: number }) {
  return (
    <group position={[x, 0, y]}>
      <mesh position={[0, 0.08, 0]} castShadow>
        <boxGeometry args={[1.05, 0.16, 1.05]} />
        <meshStandardMaterial color="#c8b060" />
      </mesh>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.88, 0.54, 0.88]} />
        <meshStandardMaterial color={palette.building.templeBody} />
      </mesh>
      <mesh position={[0, 0.9, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.78, 0.6, 4]} />
        <meshStandardMaterial color={palette.building.templeRoof} />
      </mesh>
      {/* spire */}
      <mesh position={[0, 1.3, 0]}>
        <coneGeometry args={[0.06, 0.32, 6]} />
        <meshStandardMaterial color="#d4a820" />
      </mesh>
    </group>
  )
}

function AcademyMesh({ x, y }: { x: number; y: number }) {
  return (
    <group position={[x, 0, y]}>
      {/* main hall */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.95, 0.6, 0.75]} />
        <meshStandardMaterial color={palette.building.academyBody} />
      </mesh>
      {/* wing left */}
      <mesh position={[-0.55, 0.22, 0]} castShadow>
        <boxGeometry args={[0.2, 0.44, 0.5]} />
        <meshStandardMaterial color={palette.building.academyBody} />
      </mesh>
      <mesh position={[0, 0.76, 0]}>
        <boxGeometry args={[1.1, 0.12, 0.9]} />
        <meshStandardMaterial color={palette.building.academyRoof} />
      </mesh>
    </group>
  )
}

function PharmacyMesh({ x, y }: { x: number; y: number }) {
  return (
    <group position={[x, 0, y]}>
      <mesh position={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[0.75, 0.56, 0.75]} />
        <meshStandardMaterial color={palette.building.pharmacyBody} />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <coneGeometry args={[0.6, 0.45, 4]} />
        <meshStandardMaterial color={palette.building.pharmacyRoof} />
      </mesh>
      {/* herb mortar hint */}
      <mesh position={[0, 0.12, 0.42]}>
        <cylinderGeometry args={[0.09, 0.11, 0.1, 8]} />
        <meshStandardMaterial color="#8b7355" />
      </mesh>
    </group>
  )
}

function GranaryMesh({ x, y }: { x: number; y: number }) {
  const baseY = isMountainAt(x, y) ? tileH(x, y) : 0
  return (
    <group position={[x, baseY, y]}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.9, 0.6, 0.9]} />
        <meshStandardMaterial color={palette.building.granaryBody} />
      </mesh>
      <mesh position={[0, 0.75, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.74, 0.45, 4]} />
        <meshStandardMaterial color={palette.building.granaryRoof} />
      </mesh>
      <mesh position={[0.32, 0.2, 0.32]}>
        <cylinderGeometry args={[0.06, 0.06, 0.18, 8]} />
        <meshStandardMaterial color="#f0d98a" />
      </mesh>
    </group>
  )
}

// ─── 疫病警示标记（浮动红十字 + 亡者骷髅）────────────────────────────────

function SickHouseMarker({ x, y, deadCount }: { x: number; y: number; deadCount: number }) {
  const groupRef = React.useRef<THREE.Group>(null)
  const matH = React.useRef<THREE.MeshStandardMaterial>(null)
  const matV = React.useRef<THREE.MeshStandardMaterial>(null)
  const timeRef = React.useRef(Math.random() * Math.PI * 2)

  useFrame((_, delta) => {
    timeRef.current += delta
    if (groupRef.current) {
      groupRef.current.position.y = 1.45 + Math.sin(timeRef.current * 2.5) * 0.08
    }
    const intensity = 0.5 + Math.abs(Math.sin(timeRef.current * 3)) * 0.5
    if (matH.current) matH.current.emissiveIntensity = intensity
    if (matV.current) matV.current.emissiveIntensity = intensity
  })

  const crossColor = deadCount > 0 ? '#8b0000' : '#ff2200'
  const glowColor  = deadCount > 0 ? '#cc0000' : '#ff6600'

  return (
    <group position={[x, 0, y]}>
      <group ref={groupRef} position={[0, 1.45, 0]}>
        {/* 横杆 */}
        <mesh>
          <boxGeometry args={[0.24, 0.07, 0.07]} />
          <meshStandardMaterial ref={matH} color={crossColor} emissive={glowColor} emissiveIntensity={0.6} />
        </mesh>
        {/* 竖杆 */}
        <mesh>
          <boxGeometry args={[0.07, 0.24, 0.07]} />
          <meshStandardMaterial ref={matV} color={crossColor} emissive={glowColor} emissiveIntensity={0.6} />
        </mesh>
        {/* 光环 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.16, 0.21, 18]} />
          <meshBasicMaterial color={glowColor} transparent opacity={0.55} />
        </mesh>
      </group>

      {/* 亡者骷髅标记（仅当 deadCount > 0 时显示） */}
      {deadCount > 0 && (
        <group position={[0, 1.1, 0]}>
          {/* 骷髅头颅 */}
          <mesh>
            <sphereGeometry args={[0.075, 8, 8]} />
            <meshStandardMaterial color="#1a0505" emissive="#660000" emissiveIntensity={0.4} />
          </mesh>
          {/* 眼眶左 */}
          <mesh position={[-0.028, 0.018, 0.068]}>
            <sphereGeometry args={[0.016, 6, 6]} />
            <meshBasicMaterial color="#000000" />
          </mesh>
          {/* 眼眶右 */}
          <mesh position={[0.028, 0.018, 0.068]}>
            <sphereGeometry args={[0.016, 6, 6]} />
            <meshBasicMaterial color="#000000" />
          </mesh>
          {/* 数量文字用小方块代替（N个死亡 → N个红点） */}
          {Array.from({ length: Math.min(deadCount, 5) }).map((_, i) => (
            <mesh key={i} position={[-0.04 + i * 0.02, -0.1, 0]}>
              <boxGeometry args={[0.012, 0.012, 0.012]} />
              <meshBasicMaterial color="#ff0000" />
            </mesh>
          ))}
        </group>
      )}
    </group>
  )
}


// ─── Road pathfinding utilities (module-level) ────────────────────────────

function rasterLine(a: { x: number; y: number }, b: { x: number; y: number }) {
  const pts: { x: number; y: number }[] = []
  let dx = Math.abs(b.x - a.x); let dy = Math.abs(b.y - a.y)
  const sx = a.x < b.x ? 1 : -1; const sy = a.y < b.y ? 1 : -1
  let err = dx - dy; let x = a.x; let y = a.y
  while (true) {
    pts.push({ x, y }); if (x === b.x && y === b.y) break
    const e2 = err * 2
    if (e2 > -dy) { err -= dy; x += sx }
    if (e2 < dx) { err += dx; y += sy }
  }
  return pts
}

function expandToFourNeighborPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return pts
  const out: { x: number; y: number }[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1]
    const cur = pts[i]
    const dx = cur.x - prev.x
    const dy = cur.y - prev.y
    if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
      out.push({ x: cur.x, y: prev.y })
    }
    out.push(cur)
  }
  return out
}

class MinHeap<T> {
  private data: { f: number; item: T }[] = []
  push(f: number, item: T) {
    this.data.push({ f, item }); this._siftUp(this.data.length - 1)
  }
  pop(): T | undefined {
    if (this.data.length === 0) return undefined
    const top = this.data[0].item
    const last = this.data.pop()!
    if (this.data.length > 0) { this.data[0] = last; this._siftDown(0) }
    return top
  }
  get size() { return this.data.length }
  private _siftUp(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.data[p].f <= this.data[i].f) break
      ;[this.data[p], this.data[i]] = [this.data[i], this.data[p]]; i = p
    }
  }
  private _siftDown(i: number) {
    while (true) {
      let m = i; const l = 2 * i + 1, r = 2 * i + 2
      if (l < this.data.length && this.data[l].f < this.data[m].f) m = l
      if (r < this.data.length && this.data[r].f < this.data[m].f) m = r
      if (m === i) break
      ;[this.data[m], this.data[i]] = [this.data[i], this.data[m]]; i = m
    }
  }
}

/**
 * A* road pathfinding on the tile grid.
 * avoidMountains=true → mountain tiles cost 100 (go around if flat route exists).
 * avoidMountains=false → mountain tiles cost 2 (allow climbing when dest is on mountain).
 * River tiles are impassable.
 */
function astarRoad(
  start: { x: number; y: number },
  end: { x: number; y: number },
  avoidMountains: boolean,
  blockedTiles?: Set<string>,   // buildings + farmZone tiles (must route around them)
): { x: number; y: number }[] {
  const halfX = Math.floor(MAP_SIZE_X / 2)
  const halfY = Math.floor(MAP_SIZE_Y / 2)
  function inBounds(x: number, y: number) {
    return x >= -halfX && x < halfX && y >= -halfY && y < halfY
  }
  function tileCost(x: number, y: number): number {
    if (blockedTiles?.has(`${x},${y}`)) return Infinity  // buildings & farm tiles
    if (isRiverAt(x, y)) return 8                        // bridge: costly but allowed
    if (isMountainAt(x, y)) return avoidMountains ? 100 : 2
    return 1
  }
  function h(x: number, y: number) { return Math.abs(x - end.x) + Math.abs(y - end.y) }

  const key = (x: number, y: number) => `${x},${y}`
  const startKey = key(start.x, start.y)
  const endKey = key(end.x, end.y)
  const gScore = new Map<string, number>([[startKey, 0]])
  const parent = new Map<string, string | null>([[startKey, null]])
  const closed = new Set<string>()
  const heap = new MinHeap<{ x: number; y: number; k: string }>()
  heap.push(h(start.x, start.y), { x: start.x, y: start.y, k: startKey })

  const DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
  let found = false
  for (let iter = 0; iter < 5000 && heap.size > 0; iter++) {
    const cur = heap.pop()!
    if (closed.has(cur.k)) continue
    if (cur.k === endKey) { found = true; break }
    closed.add(cur.k)
    const curG = gScore.get(cur.k) ?? Infinity
    for (const d of DIRS) {
      const nx = cur.x + d.x, ny = cur.y + d.y
      if (!inBounds(nx, ny)) continue
      const nk = key(nx, ny)
      if (closed.has(nk)) continue
      const cost = tileCost(nx, ny)
      if (!isFinite(cost)) continue
      const newG = curG + cost
      if (newG < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, newG); parent.set(nk, cur.k)
        heap.push(newG + h(nx, ny), { x: nx, y: ny, k: nk })
      }
    }
  }

  if (!found) return rasterLine(start, end)   // fallback: straight Bresenham line

  const path: { x: number; y: number }[] = []
  let k: string | null = endKey
  while (k !== null) {
    const [xi, yi] = k.split(',').map(Number)
    path.push({ x: xi, y: yi })
    k = parent.get(k) ?? null
  }
  path.reverse()
  return path
}

// ─── Variable-height instanced flat mesh ──────────────────────────────────
// Like FlatInstances but each item carries its own y coordinate.
// Used for road preview tiles on mountain terrain.

function VariableHeightFlatInstances({
  items, size, color, opacity = 1,
}: {
  items: Array<{ x: number; y: number; h: number }>
  size: [number, number]
  color: string
  opacity?: number
}) {
  const ref = React.useRef<THREE.InstancedMesh>(null)
  React.useLayoutEffect(() => {
    if (!ref.current || items.length === 0) return
    const mesh = ref.current
    const temp = new THREE.Object3D()
    mesh.count = items.length
    for (let i = 0; i < items.length; i++) {
      const { x, y, h } = items[i]
      temp.position.set(x, h, y)
      temp.rotation.set(-Math.PI / 2, 0, 0)
      temp.scale.set(1, 1, 1)
      temp.updateMatrix()
      mesh.setMatrixAt(i, temp.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [items])
  if (items.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(items.length, 1)]} frustumCulled={false}>
      <planeGeometry args={size} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </instancedMesh>
  )
}

// ─── Road ghost preview ────────────────────────────────────────────────────

function RoadPreviewInstances({ tiles }: { tiles: Array<{ x: number; y: number }> }) {
  const flatTiles = React.useMemo(() => tiles.filter(t => !isMountainAt(t.x, t.y)), [tiles])
  // Mountain preview tiles each sit 0.05 units above their own terrain surface
  const mtnItems  = React.useMemo(() =>
    tiles
      .filter(t => isMountainAt(t.x, t.y))
      .map(t => ({ x: t.x, y: t.y, h: tileH(t.x, t.y) + 0.05 })),
    [tiles],
  )
  if (tiles.length === 0) return null
  return (
    <>
      {flatTiles.length > 0 && (
        <FlatInstances items={flatTiles} y={0.09} size={[0.88, 0.88]} color="#1890ff" opacity={0.60} />
      )}
      {mtnItems.length > 0 && (
        <VariableHeightFlatInstances items={mtnItems} size={[0.88, 0.88]} color="#fa8c16" opacity={0.65} />
      )}
    </>
  )
}

// ─── Map scene ────────────────────────────────────────────────────────────

export default function MapScene() {
  const halfX = Math.floor(MAP_SIZE_X / 2)
  const halfY = Math.floor(MAP_SIZE_Y / 2)
  const tiles = React.useMemo(() => {
    const all: [number, number][] = []
    for (let i = -halfX; i < halfX; i++)
      for (let j = -halfY; j < halfY; j++) all.push([i, j])
    return all
  }, [MAP_SIZE_X, MAP_SIZE_Y])

  const { state, placeBuilding, placeRoad, removeBuilding, removeRoad, placeFarmZone, removeFarmZone, selectBuilding, selectCitizen, selectTool, selectFarmZone } = useSimulation()
  const { gl, camera, scene } = useThree()
  const stateRef = React.useRef(state)
  const actionsRef = React.useRef({ placeBuilding, placeRoad, removeBuilding, removeRoad, placeFarmZone, removeFarmZone, selectBuilding, selectCitizen, selectFarmZone })
  const dragRef = React.useRef({ active: false, didDrag: false, lastTileKey: '', lastTile: null as null | { x: number; y: number } })
  const objectClickedRef = React.useRef(false)
  // Road preview state (A* ghost path shown while dragging in road mode)
  const [roadPreview, setRoadPreview] = React.useState<{ x: number; y: number }[]>([])
  const roadPreviewRef = React.useRef<{ x: number; y: number }[]>([])
  const roadDragStartRef = React.useRef<{ x: number; y: number } | null>(null)
  // Ghost preview mouse tracking
  const mouseNDCRef = React.useRef({ x: 0, y: 0 })
  const mouseOnCanvasRef = React.useRef(false)
  const [viewRect, setViewRect] = React.useState<RangeRect>({ minX: -16, maxX: 16, minY: -12, maxY: 12 })
  const cullMargin = 3.5

  const houseMap = React.useMemo(() => new Map(state.buildings.filter(b => b.type === 'house').map(h => [h.id, h] as const)), [state.buildings])
  const residentItems = React.useMemo<ResidentRenderItem[]>(() => {
    return state.citizens
      .filter(c => c.isAtHome)
      .map(c => {
        const house = houseMap.get(c.houseId)
        if (!house) return null
        let hash = 0
        for (let i = 0; i < c.id.length; i++) hash = (hash * 31 + c.id.charCodeAt(i)) | 0
        return { id: c.id, x: house.x, y: house.y, seed: Math.abs(hash % 1000) + 1 }
      })
      .filter((v): v is ResidentRenderItem => Boolean(v))
  }, [state.citizens, houseMap])

  const tileTree = React.useMemo(() => SpatialBST.fromItems(tiles.map(t => ({ x: t[0], y: t[1], value: t }))), [tiles])
  const roadTree = React.useMemo(() => SpatialBST.fromItems(state.roads.map(r => ({ x: r.x, y: r.y, value: r }))), [state.roads])
  const riverTree = React.useMemo(() => SpatialBST.fromItems(RIVER_TILES.map(r => ({ x: r.x, y: r.y, value: r }))), [])
  const buildingTree = React.useMemo(() => SpatialBST.fromItems(state.buildings.map(b => ({ x: b.x, y: b.y, value: b }))), [state.buildings])
  const residentTree = React.useMemo(() => SpatialBST.fromItems(residentItems.map(r => ({ x: r.x, y: r.y, value: r }))), [residentItems])
  // Mountain and ore vein spatial trees (module-level constants, memoised once)
  const mountainTree    = React.useMemo(() => SpatialBST.fromItems(MOUNTAIN_TILES.map(t => ({ x: t.x, y: t.y, value: [t.x, t.y] as [number, number] }))), [])
  const oreVeinTree     = React.useMemo(() => SpatialBST.fromItems(ORE_VEIN_TILES.map(t => ({ x: t.x, y: t.y, value: t }))), [])

  // cullRect must be declared BEFORE any memo that depends on it
  const cullRect = React.useMemo<RangeRect>(() => ({
    minX: viewRect.minX - cullMargin,
    maxX: viewRect.maxX + cullMargin,
    minY: viewRect.minY - cullMargin,
    maxY: viewRect.maxY + cullMargin,
  }), [viewRect])

  // Farm zones: the zone objects visible in current view (for FarmZoneInstances)
  const visibleFarmZones = React.useMemo(() =>
    state.farmZones.filter(z =>
      z.x + 1 >= cullRect.minX && z.x <= cullRect.maxX &&
      z.y + 1 >= cullRect.minY && z.y <= cullRect.maxY
    ), [state.farmZones, cullRect])

  // Farmers currently at the farm field (not at home, not in transit)
  const farmersAtFarm = React.useMemo(() => {
    const walkerIds = new Set(state.walkers.map(w => w.citizenId))
    return state.citizens
      .filter(c =>
        c.farmZoneId && !c.isAtHome && !walkerIds.has(c.id)
      )
      .flatMap(c => {
        const zone = state.farmZones.find(z => z.id === c.farmZoneId)
        if (!zone) return []
        if (zone.x + 1 < cullRect.minX || zone.x > cullRect.maxX ||
            zone.y + 1 < cullRect.minY || zone.y > cullRect.maxY) return []
        let hash = 0
        for (let i = 0; i < c.id.length; i++) hash = (hash * 31 + c.id.charCodeAt(i)) | 0
        return [{ id: c.id, x: zone.x + 0.5, y: zone.y + 0.5, seed: Math.abs(hash % 1000) + 1 }]
      })
  }, [state.citizens, state.farmZones, state.walkers, cullRect])

  const selectedFarmZoneTiles = React.useMemo(() => {
    const zone = state.selectedFarmZoneId ? state.farmZones.find(z => z.id === state.selectedFarmZoneId) : null
    if (!zone) return []
    return [
      { x: zone.x,   y: zone.y },
      { x: zone.x+1, y: zone.y },
      { x: zone.x,   y: zone.y+1 },
      { x: zone.x+1, y: zone.y+1 },
    ]
  }, [state.farmZones, state.selectedFarmZoneId])


  const visibleTiles = React.useMemo(() => tileTree.rangeQuery(cullRect), [tileTree, cullRect])
  const visibleRoads = React.useMemo(() => roadTree.rangeQuery(cullRect), [roadTree, cullRect])
  const visibleBridges = React.useMemo(() => visibleRoads.filter(r => isRiverAt(r.x, r.y)), [visibleRoads])
  const visibleNonBridgeRoads = React.useMemo(() => visibleRoads.filter(r => !isRiverAt(r.x, r.y)), [visibleRoads])
  const visibleRiverTiles = React.useMemo(() => riverTree.rangeQuery(cullRect), [riverTree, cullRect])
  const visibleBuildings = React.useMemo(() => buildingTree.rangeQuery(cullRect), [buildingTree, cullRect])
  const visibleResidents = React.useMemo(() => residentTree.rangeQuery(cullRect), [residentTree, cullRect])
  // Arable tiles: within 5 tiles of river, not mountain (shown in farmZone tool overlay)
  const visibleArableTiles = React.useMemo(() =>
    visibleTiles.filter(t => isNearRiverFive(t[0], t[1]) && !isMountainAt(t[0], t[1])).map(t => ({ x: t[0], y: t[1] })),
    [visibleTiles])
  // Mountain and ore vein visible tiles
  const visibleMountainTiles = React.useMemo(() => mountainTree.rangeQuery(cullRect), [mountainTree, cullRect])
  // Hide ore vein markers where a mine has been built
  const visibleOreVeinTiles  = React.useMemo(() =>
    oreVeinTree.rangeQuery(cullRect).filter(t => !state.buildings.some(b => b.x === t.x && b.y === t.y)),
    [oreVeinTree, cullRect, state.buildings])

  React.useEffect(() => { stateRef.current = state }, [state])
  React.useEffect(() => {
    actionsRef.current = { placeBuilding, placeRoad, removeBuilding, removeRoad, placeFarmZone, removeFarmZone, selectBuilding, selectCitizen, selectFarmZone }
  }, [placeBuilding, placeRoad, removeBuilding, removeRoad, placeFarmZone, removeFarmZone, selectBuilding, selectCitizen, selectFarmZone])

  // Expose pathfinding helpers for e2e tests
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      ;(window as any).__ASTAR_ROAD__    = astarRoad
      ;(window as any).__IS_MOUNTAIN_AT__ = isMountainAt
    }
  }, [])

  React.useEffect(() => {
    try {
      ;(window as any).__THREE_CAMERA__ = camera
      ;(window as any).__THREE_SCENE__ = scene
      ;(window as any).__MAP_TO_SCREEN__ = (x: number, y: number) => {
        const rect = gl.domElement.getBoundingClientRect()
        const proj = new THREE.Vector3(x, 0, y).project(camera as THREE.Camera)
        return { x: ((proj.x + 1) / 2) * rect.width + rect.left, y: ((-proj.y + 1) / 2) * rect.height + rect.top }
      }
    } catch (e) {}
  }, [camera, scene, gl])

  const cullClockRef = React.useRef(0)
  const planeRef = React.useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const raycasterRef = React.useRef(new THREE.Raycaster())
  const hitRef = React.useRef(new THREE.Vector3())
  useFrame((_, delta) => {
    cullClockRef.current += delta
    if (cullClockRef.current < 0.1) return
    cullClockRef.current = 0

    const rect = gl.domElement.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const corners: Array<[number, number]> = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
    const pts: { x: number; y: number }[] = []
    for (const [ndcX, ndcY] of corners) {
      raycasterRef.current.setFromCamera({ x: ndcX, y: ndcY } as any, camera as THREE.Camera)
      // Try the canonical intersectPlane first. If it fails (ray parallel / numerical),
      // compute a safe fallback intersection point on the y=0 plane so we still
      // produce a sensible view rect near map edges.
      const ray = raycasterRef.current.ray
      const intersect = ray.intersectPlane(planeRef.current, hitRef.current)
      if (!intersect) {
        // Fallback: compute t such that origin.y + dir.y * t = 0 (plane y=0).
        // Only accept that t if it's > 0 (intersection in front of camera).
        // Otherwise use a forward fallback distance so the corner point is in front.
        const origin = ray.origin.clone()
        const dir = ray.direction.clone()
        let tY = Infinity
        if (Math.abs(dir.y) > 1e-6) tY = -origin.y / dir.y
        let t: number
        if (tY > 0 && isFinite(tY) && tY < 1e7) {
          t = tY
        } else {
          // pick a positive forward distance (half camera.far if available, else 1000)
          const cam = camera as THREE.PerspectiveCamera | THREE.Camera
          const far = (cam as any).far ?? 2000
          t = Math.max(50, Math.min(10000, far * 0.5))
        }
        ray.at(t, hitRef.current)
      }
      pts.push({ x: hitRef.current.x, y: hitRef.current.z })
    }

    // Remove any bad points (NaN / Infinite) that may arise from numerical edge cases
    const finitePts = pts.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))

    const halfX = Math.floor(MAP_SIZE_X / 2)
    const halfY = Math.floor(MAP_SIZE_Y / 2)
    const MAP_MIN_X = -halfX, MAP_MAX_X = halfX - 1
    const MAP_MIN_Y = -halfY, MAP_MAX_Y = halfY - 1

    let minX: number, maxX: number, minY: number, maxY: number
    if (finitePts.length >= 3) {
      minX = Math.floor(Math.min(...finitePts.map(p => p.x)))
      maxX = Math.ceil(Math.max(...finitePts.map(p => p.x)))
      minY = Math.floor(Math.min(...finitePts.map(p => p.y)))
      maxY = Math.ceil(Math.max(...finitePts.map(p => p.y)))
    } else {
      // Fallback: use camera center projection to ground; if that fails, use camera position
      const rc = raycasterRef.current
      rc.setFromCamera({ x: 0, y: 0 } as any, camera as THREE.Camera)
      const ok = rc.ray.intersectPlane(planeRef.current, hitRef.current)
      const cx = ok ? hitRef.current.x : (camera.position.x ?? 0)
      const cy = ok ? hitRef.current.z : (camera.position.z ?? 0)
      const W = Math.max(8, Math.floor((MAP_MAX_X - MAP_MIN_X) * 0.2))
      const H = Math.max(6, Math.floor((MAP_MAX_Y - MAP_MIN_Y) * 0.15))
      minX = Math.floor(cx - W)
      maxX = Math.ceil(cx + W)
      minY = Math.floor(cy - H)
      maxY = Math.ceil(cy + H)
    }

    // Clamp to map bounds to avoid extreme cull rects
    minX = Math.max(minX, MAP_MIN_X)
    maxX = Math.min(maxX, MAP_MAX_X)
    minY = Math.max(minY, MAP_MIN_Y)
    maxY = Math.min(maxY, MAP_MAX_Y)

    // If clamping produced an invalid rect (min>max), fallback to a small centered rect
    if (minX > maxX || minY > maxY) {
      const cx = Math.round((MAP_MIN_X + MAP_MAX_X) / 2)
      const cy = Math.round((MAP_MIN_Y + MAP_MAX_Y) / 2)
      minX = cx - 16; maxX = cx + 16; minY = cy - 12; maxY = cy + 12
    }

    setViewRect(prev => {
      if (Math.abs(prev.minX - minX) < 1 && Math.abs(prev.maxX - maxX) < 1 && Math.abs(prev.minY - minY) < 1 && Math.abs(prev.maxY - maxY) < 1) {
        return prev
      }
      return { minX, maxX, minY, maxY }
    })
  })

  // Interaction effect (stable, uses refs)
  React.useEffect(() => {
    const plane      = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)  // Y=0 fallback only
    const raycaster  = new THREE.Raycaster()
    const intersectPt = new THREE.Vector3()

    function stopDrag() { dragRef.current.active = false; dragRef.current.lastTileKey = ''; dragRef.current.lastTile = null }

    function getTile(e: MouseEvent) {
      const rect = gl.domElement.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera({ x: ndcX, y: ndcY } as any, camera as THREE.Camera)

      const { origin: ro, direction: rd } = raycaster.ray
      if (rd.y >= 0) return null  // ray points upward — no ground intersection

      // ── Terrain ray-march ────────────────────────────────────────────────
      // Advance along the ray 0.35 world-units at a time.
      // • py ≤ tileH(cx,cz) → entered mountain geometry  → return that tile
      // • py ≤ 0            → hit flat ground (Y=0)       → return that tile
      // No base-projection bias; works at any camera tilt including near-horizontal.
      const STEP = 0.35
      for (let i = 1; i <= 700; i++) {
        const t  = i * STEP
        const px = ro.x + rd.x * t
        const py = ro.y + rd.y * t
        const pz = ro.z + rd.z * t
        const cx = Math.round(px), cz = Math.round(pz)

        if (py <= 0) {
          // Precise Y=0 crossing
          const t0 = -ro.y / rd.y
          return { x: Math.round(ro.x + rd.x * t0), y: Math.round(ro.z + rd.z * t0) }
        }
        const terrainH = isMountainAt(cx, cz) ? tileH(cx, cz) : 0
        if (py <= terrainH) return { x: cx, y: cz }
      }
      // Fallback (shouldn't normally be reached)
      if (!raycaster.ray.intersectPlane(plane, intersectPt)) return null
      return { x: Math.round(intersectPt.x), y: Math.round(intersectPt.z) }
    }

    function applyTool(wx: number, wy: number) {
      const s = stateRef.current; const tool = s.selectedTool
      if (tool === 'pan') {
        // Farm zone click (farm zones have no R3F object → handled here)
        const fz = s.farmZones.find(z => wx >= z.x && wx <= z.x + 1 && wy >= z.y && wy <= z.y + 1)
        if (fz) {
          actionsRef.current.selectFarmZone(fz.id)
          return
        }
        actionsRef.current.selectBuilding(null)
        actionsRef.current.selectCitizen(null)
        actionsRef.current.selectFarmZone(null)
        return
      }
      if (tool === 'house' || tool === 'market' || tool === 'granary' || tool === 'blacksmith' || tool === 'mine') {
        const action = actionsRef.current.placeBuilding(wx, wy, tool)
        // show immediate toast on failure so user gets feedback at click location
        if (action && !action.success) {
          const reasonMap: Record<string,string> = {
            'no-build-type-selected': '请先选择建造类型。',
            'insufficient-funds': '资金不足，无法建造。',
            'tile-occupied': '该格子已有建筑或占用。',
            'road-occupied': '该格已有道路，请先推平。',
            'river-occupied': '该处为河流，无法建造。',
            'no-ore-vein': '此处无铁矿脉，冶铁厂只能建于矿脉上。',
          }
          const msg = reasonMap[action.reason] ?? action.reason
          try { message.warning(msg) } catch (e) { /* ignore if running headless/test */ }
        }
      } else if (tool === 'road') {
        actionsRef.current.placeRoad(wx, wy)
      } else if (tool === 'farmZone') {
        actionsRef.current.placeFarmZone(wx, wy)
      } else if (tool === 'bulldoze') {
        const b = s.buildings.find(b => b.x === wx && b.y === wy)
        if (b) { actionsRef.current.removeBuilding(b.id); return }
        if (s.roads.some(r => r.x === wx && r.y === wy)) actionsRef.current.removeRoad(wx, wy)
        if (s.farmZones.some(z => z.x === wx && z.y === wy)) actionsRef.current.removeFarmZone(wx, wy)
      }
    }

    function paintRoad(tile: { x: number; y: number }) {
      const s = stateRef.current
      if (s.buildings.some(b => b.x === tile.x && b.y === tile.y)) return
      if (s.farmZones.some(z => tile.x >= z.x && tile.x <= z.x+1 && tile.y >= z.y && tile.y <= z.y+1)) return
      actionsRef.current.placeRoad(tile.x, tile.y)
    }

    function paintFarmZone(tile: { x: number; y: number }) {
      const s = stateRef.current
      if (s.buildings.some(b => b.x === tile.x && b.y === tile.y)) return
      if (s.roads.some(r => r.x === tile.x && r.y === tile.y)) return
      actionsRef.current.placeFarmZone(tile.x, tile.y)
    }

    function onClick(e: MouseEvent) {
      if (objectClickedRef.current) { objectClickedRef.current = false; return }
      if ((stateRef.current.selectedTool === 'road' || stateRef.current.selectedTool === 'farmZone') && dragRef.current.didDrag) { dragRef.current.didDrag = false; return }
      const t = getTile(e); if (t) applyTool(t.x, t.y)
    }

    function onMouseDown(e: MouseEvent) {
      const tool = stateRef.current.selectedTool
      if (tool !== 'road' && tool !== 'farmZone') return
      dragRef.current.active = true
      dragRef.current.lastTileKey = ''
      dragRef.current.lastTile = null
      const t = getTile(e); if (!t) return
      dragRef.current.lastTileKey = `${t.x},${t.y}`

      if (tool === 'road') {
        // Road: don't build immediately — show preview, commit on mouseup
        dragRef.current.didDrag = false
        roadDragStartRef.current = t
        const preview = [t]
        setRoadPreview(preview)
        roadPreviewRef.current = preview
      } else {
        // FarmZone: keep original paint-on-drag behaviour
        dragRef.current.didDrag = true
        dragRef.current.lastTile = t
        paintFarmZone(t)
      }
    }

    function onMouseMove(e: MouseEvent) {
      const tool = stateRef.current.selectedTool
      if (!dragRef.current.active) return
      const t = getTile(e); if (!t) return
      const key = `${t.x},${t.y}`; if (key === dragRef.current.lastTileKey) return
      dragRef.current.lastTileKey = key

      if (tool === 'road' && roadDragStartRef.current) {
        dragRef.current.didDrag = true
        const start = roadDragStartRef.current
        const endOnMtn   = isMountainAt(t.x, t.y)
        const startOnMtn = isMountainAt(start.x, start.y)
        // Avoid mountains unless the destination tile is itself on a mountain
        const avoidMountains = !endOnMtn && !startOnMtn
        // Buildings and farm tiles cannot be paved — route around them
        const s = stateRef.current
        const blockedTiles = new Set<string>([
          ...s.buildings.map(b => `${b.x},${b.y}`),
          ...s.farmZones.flatMap(z => [
            `${z.x},${z.y}`, `${z.x+1},${z.y}`,
            `${z.x},${z.y+1}`, `${z.x+1},${z.y+1}`,
          ]),
        ])
        const path = astarRoad(start, t, avoidMountains, blockedTiles)
        setRoadPreview(path)
        roadPreviewRef.current = path
      } else if (tool === 'farmZone') {
        const from = dragRef.current.lastTile ?? t
        const path = expandToFourNeighborPath(rasterLine(from, t))
        path.forEach(paintFarmZone)
        dragRef.current.lastTile = t
        dragRef.current.didDrag = true
      }
    }

    function onMouseUpHandler() {
      if (dragRef.current.active && stateRef.current.selectedTool === 'road') {
        if (dragRef.current.didDrag && roadPreviewRef.current.length > 0) {
          for (const tile of roadPreviewRef.current) paintRoad(tile)
        }
        setRoadPreview([])
        roadPreviewRef.current = []
        roadDragStartRef.current = null
      }
      stopDrag()
    }

    const c = gl.domElement
    c.addEventListener('click', onClick)
    c.addEventListener('mousedown', onMouseDown)
    c.addEventListener('mouseleave', () => stopDrag())
    // Ghost preview mouse tracking
    function onMouseMoveGhost(e: MouseEvent) {
      const rect = gl.domElement.getBoundingClientRect()
      mouseNDCRef.current = {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
      }
      mouseOnCanvasRef.current = true
    }
    function onMouseLeaveGhost() { mouseOnCanvasRef.current = false }
    c.addEventListener('mousemove', onMouseMoveGhost)
    c.addEventListener('mouseleave', onMouseLeaveGhost)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUpHandler)
    window.addEventListener('blur', () => stopDrag())
    return () => {
      c.removeEventListener('click', onClick)
      c.removeEventListener('mousedown', onMouseDown)
      c.removeEventListener('mousemove', onMouseMoveGhost)
      c.removeEventListener('mouseleave', onMouseLeaveGhost)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUpHandler)
      setRoadPreview([]); roadPreviewRef.current = []; roadDragStartRef.current = null
      stopDrag()
    }
  }, [gl, camera])

  function buildingMesh(b: typeof state.buildings[0]) {
    switch (b.type) {
      case 'house':       return <HouseMesh       key={b.id} x={b.x} y={b.y} occupants={b.occupants} />
      case 'market':      return <MarketMesh      key={b.id} x={b.x} y={b.y} />
      case 'granary':     return <GranaryMesh     key={b.id} x={b.x} y={b.y} />
      case 'blacksmith':  return <BlacksmithMesh  key={b.id} x={b.x} y={b.y} />
      case 'mine':        return <MineMesh        key={b.id} x={b.x} y={b.y} />
    }
  }

  const showTerrainOverlay = state.selectedTool === 'farmZone'

  // 疫病警示：有病患的房屋 + 有未清理亡者的房屋
  const sickHouses = React.useMemo(() => {
    const sickHouseIds = new Set(state.citizens.filter(c => c.isSick).map(c => c.houseId))
    const deadEntries = state.houseDead ?? {}
    const deadHouseIds = new Set(Object.entries(deadEntries).filter(([, v]) => v > 0).map(([k]) => k))
    const allAffected = new Set([...sickHouseIds, ...deadHouseIds])
    return state.buildings
      .filter(b => b.type === 'house' && allAffected.has(b.id))
      .filter(b => b.x + 1 >= cullRect.minX && b.x <= cullRect.maxX && b.y + 1 >= cullRect.minY && b.y <= cullRect.maxY)
  }, [state.citizens, state.buildings, state.houseDead, cullRect])

  const visibleWalkers = React.useMemo(() => state.walkers.filter(w => {
    const p = logicalWalkerPos(w)
    return p.x >= cullRect.minX && p.x <= cullRect.maxX && p.y >= cullRect.minY && p.y <= cullRect.maxY
  }), [state.walkers, cullRect])
  const visibleMigrants = React.useMemo(() => state.migrants.filter(m => {
    const p = logicalMigrantPos(m)
    return p.x >= cullRect.minX && p.x <= cullRect.maxX && p.y >= cullRect.minY && p.y <= cullRect.maxY
  }), [state.migrants, cullRect])
  const visibleFarmPiles = React.useMemo(() =>
    state.farmPiles.filter(p =>
      p.x >= cullRect.minX - 1 && p.x <= cullRect.maxX + 1 &&
      p.y >= cullRect.minY - 1 && p.y <= cullRect.maxY + 1
    ), [state.farmPiles, cullRect])
  const visibleOxCarts = React.useMemo(() => state.oxCarts.filter(c => {
    const p = logicalOxCartPos(c)
    return p.x >= cullRect.minX && p.x <= cullRect.maxX && p.y >= cullRect.minY && p.y <= cullRect.maxY
  }), [state.oxCarts, cullRect])
  const visibleMarketBuyers = React.useMemo(() => state.marketBuyers.filter(mb => {
    const p = logicalMarketBuyerPos(mb)
    return p.x >= cullRect.minX && p.x <= cullRect.maxX && p.y >= cullRect.minY && p.y <= cullRect.maxY
  }), [state.marketBuyers, cullRect])
  const visiblePeddlers = React.useMemo(() => state.peddlers.filter(p => {
    const pos = logicalPeddlerPos(p)
    return pos.x >= cullRect.minX && pos.x <= cullRect.maxX && pos.y >= cullRect.minY && pos.y <= cullRect.maxY
  }), [state.peddlers, cullRect])

  return (
    <group>
      <DayNightLighting />
      <NightOverlay />

      <TileInstances tiles={visibleTiles} />

      {/* 3-D Mountain terrain (raised rock boxes) */}
      <MountainInstances tiles={visibleMountainTiles} />

      {/* Smooth river ribbon (Catmull-Rom geometry, no staircase bends) */}
      <SmoothRiverMesh />
      {/* Animated flowing foam – sampled along the smooth curve */}
      <AnimatedRiverFoam tiles={RIVER_FOAM_POSITIONS} />

      {/* Iron ore vein markers – float above mountain tops (y ≈ 0.32) */}
      {visibleOreVeinTiles.length > 0 && (
        <>
          <FlatInstances items={visibleOreVeinTiles} y={0.32} size={[0.36, 0.36]} color="#5a1208" opacity={0.95} rotationZ={Math.PI / 4} />
          <FlatInstances items={visibleOreVeinTiles} y={0.33} size={[0.20, 0.20]} color="#c83c18" opacity={0.90} rotationZ={Math.PI / 4} />
        </>
      )}

      {showTerrainOverlay && (
        <>
          <CircleInstances items={visibleArableTiles} y={0.012} radius={0.08} color={palette.map.arableMark} opacity={0.85} />
        </>
      )}

      {/* Farm zones – colour by crop type × growth stage */}
      {visibleFarmZones.length > 0 && <FarmZoneInstances zones={visibleFarmZones} />}
      {selectedFarmZoneTiles.length > 0 && <FlatInstances items={selectedFarmZoneTiles} y={0.068} size={[0.90, 0.90]} color="#52c41a" opacity={0.50} />}

      {/* Farmers at work in the fields */}
      {farmersAtFarm.map(f => (
        <FarmerAtWork
          key={f.id}
          x={f.x}
          y={f.y}
          seed={f.seed}
          selected={state.selectedCitizenId === f.id}
          onClick={(e: any) => {
            e.stopPropagation()
            objectClickedRef.current = true
            selectTool('pan')
            selectBuilding(null)
            selectCitizen(state.selectedCitizenId === f.id ? null : f.id)
          }}
        />
      ))}

      {/* Roads (非桥梁段) */}
      <RoadInstances roads={visibleNonBridgeRoads} />

      {/* Bridges (跨河桥梁) */}
      <BridgeInstances bridges={visibleBridges} />

      {/* Buildings */}
      {visibleBuildings.map(b => (
        <group key={b.id} onClick={(e: any) => {
          e.stopPropagation()
          objectClickedRef.current = true
          // 推土机模式：直接拆除，不切换工具
          if (stateRef.current.selectedTool === 'bulldoze') {
            actionsRef.current.removeBuilding(b.id)
            return
          }
          selectTool('pan')
          selectCitizen(null)
          selectBuilding(state.selectedBuildingId === b.id ? null : b.id)
        }}>
          {buildingMesh(b)}
        </group>
      ))}

      {/* 疫病警示标记（房屋有病患或未清理亡者时显示） */}
      {sickHouses.map(h => (
        <SickHouseMarker
          key={`sick-${h.id}`}
          x={h.x}
          y={h.y}
          deadCount={state.houseDead?.[h.id] ?? 0}
        />
      ))}

      {/* Farm piles (harvested crops waiting for ox cart) */}
      <FarmPileInstances piles={visibleFarmPiles} />

      {/* Ox carts (granary ↔ farm) */}
      {visibleOxCarts.map(c => {
        const p = logicalOxCartPos(c)
        return <OxCartMesh key={c.id} x={p.x} y={p.y} loaded={c.pickedUp} />
      })}

      {/* Market buyers / 行商 (market ↔ granary) */}
      {visibleMarketBuyers.map(mb => {
        const p = logicalMarketBuyerPos(mb)
        return <MarketBuyerMesh key={mb.id} x={p.x} y={p.y} loaded={mb.pickedUp} />
      })}

      {/* Migrants on horseback */}
      {visibleMigrants.map(m => {
        const p = logicalMigrantPos(m)
        return <MigrantHorse key={m.id} x={p.x} y={p.y} />
      })}

      {/* Commuting walkers */}
      {visibleWalkers.map(w => {
        const p = logicalWalkerPos(w)
        return (
          <CommutingWalker
            key={w.id}
            x={p.x}
            y={p.y}
            purpose={w.purpose}
            selected={state.selectedCitizenId === w.citizenId}
            onClick={(e: any) => {
              e.stopPropagation()
              objectClickedRef.current = true
              selectTool('pan')
              selectBuilding(null)
              selectCitizen(state.selectedCitizenId === w.citizenId ? null : w.citizenId)
            }}
          />
        )
      })}

      {/* Residents at home */}
      {visibleResidents.map((item) => {
        return (
          <ResidentAvatar
            key={item.id}
            x={item.x}
            y={item.y}
            seed={item.seed}
            selected={state.selectedCitizenId === item.id}
            onClick={(e: any) => {
              e.stopPropagation()
              objectClickedRef.current = true
              selectTool('pan')
              selectBuilding(null)
              selectCitizen(state.selectedCitizenId === item.id ? null : item.id)
            }}
          />
        )
      })}

      {/* 游商（行商，肩挑货担沿路叫卖） */}
      {visiblePeddlers.map(p => {
        const pos = logicalPeddlerPos(p)
        return <PeddlerMesh key={p.id} x={pos.x} y={pos.y} />
      })}

      {/* 选中建筑高亮圈 */}
      {(() => {
        const b = state.selectedBuildingId
          ? state.buildings.find(x => x.id === state.selectedBuildingId)
          : null
        return b ? <SelectionRingMesh x={b.x} y={b.y} color="#faad14" r={0.56} /> : null
      })()}

      {/* 选中市民高亮圈 */}
      {(() => {
        const cid = state.selectedCitizenId
        if (!cid) return null
        // walker first (moving citizen)
        const walker = state.walkers.find(w => w.citizenId === cid)
        if (walker) {
          const p = logicalWalkerPos(walker)
          return <SelectionRingMesh x={p.x} y={p.y} color="#69c0ff" r={0.34} />
        }
        // farmer at farm
        const farmer = farmersAtFarm.find(f => f.id === cid)
        if (farmer) return <SelectionRingMesh x={farmer.x} y={farmer.y} color="#69c0ff" r={0.34} />
        // resident at home — must include the same seed-based offset as ResidentAvatar
        const resident = visibleResidents.find(r => r.id === cid)
        if (resident) {
          const ox = Math.sin(resident.seed) * 0.22
          const oz = Math.cos(resident.seed * 1.7) * 0.22
          return <SelectionRingMesh x={resident.x + ox} y={resident.y + oz} color="#69c0ff" r={0.34} />
        }
        // fallback: home position
        const citizen = state.citizens.find(c => c.id === cid)
        if (citizen) {
          const house = state.buildings.find(b => b.id === citizen.houseId)
          if (house) return <SelectionRingMesh x={house.x} y={house.y} color="#69c0ff" r={0.34} />
        }
        return null
      })()}

      {/* Road path ghost preview (A* result while dragging in road mode) */}
      <RoadPreviewInstances tiles={roadPreview} />

      {/* Placement ghost preview */}
      <PlacementGhost
        tool={state.selectedTool}
        stateRef={stateRef}
        mouseNDCRef={mouseNDCRef}
        mouseOnCanvasRef={mouseOnCanvasRef}
      />
      {/* Debug overlay DOM element (non-R3F) — renders outside the canvas */}
    </group>
  )
}

