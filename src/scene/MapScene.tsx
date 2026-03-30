import React from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { SIM_TICK_MS } from '../config/simulation'
import {
  useSimulation, logicalMigrantPos, logicalWalkerPos, logicalOxCartPos, logicalMarketBuyerPos,
  RIVER_TILES, isRiverAt, isNearRiverFive, RIVER_CENTER_LINE,
  MOUNTAIN_TILES, ORE_VEIN_TILES, isMountainAt, isOreVeinAt, getMountainHeight, MAP_SIZE_X, MAP_SIZE_Y,
  BUILDING_COST, ALL_BUILDING_TYPES, type BuildingType, type Tool, type CityState,
} from '../state/simulation'
import { palette } from '../theme/palette'
import { SpatialBST, type RangeRect } from './spatialBst'

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
    ref.current.position.y = moving ? 0.015 + Math.abs(stride) * 0.025 : 0
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
    ref.current.position.y = moving ? Math.abs(stride) * 0.012 : 0
    if (bodyRef.current) bodyRef.current.rotation.z = moving ? Math.sin(a.time * 10) * 0.06 : 0
  })

  const robeColor = purpose === 'toWork' ? palette.character.robe : palette.character.robeAccent

  return (
    <group ref={ref} position={[x, 0, y]} onClick={onClick}>
      {/* 不可见点击靶区：半径0.35、高0.6的圆柱体，比角色模型大~8倍，便于鼠标点中 */}
      <mesh position={[0, 0.3, 0]} visible={false}>
        <cylinderGeometry args={[0.35, 0.35, 0.6, 8]} />
        <meshBasicMaterial />
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
      {/* 不可见点击靶区 */}
      <mesh position={[0, 0.25, 0]} visible={false}>
        <cylinderGeometry args={[0.32, 0.32, 0.5, 8]} />
        <meshBasicMaterial />
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


// ─── Farm zone colour helpers ──────────────────────────────────────────────

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
      {/* Invisible hit area */}
      <mesh position={[0, 0.22, 0]} visible={false}>
        <cylinderGeometry args={[0.32, 0.32, 0.44, 8]} />
        <meshBasicMaterial />
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
  const highwayRoads = React.useMemo(() => roads.filter(r => r.y === 0 && r.x <= -6), [roads])
  return (
    <>
      {normalRoads.length > 0 && <FlatInstances items={normalRoads} y={0.05} size={[0.98, 0.98]} color={palette.map.road} />}
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
import worldGenConfig from '../config/world-gen'

function tileH(x: number, y: number): number {
  const BASE = 0.04
  const SCALE = worldGenConfig.mountain.tileScale
  return BASE + getMountainHeight(x, y) * SCALE
}
const _MAX_MOUNTAIN_H = 0.04 + worldGenConfig.mountain.tileScale

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
      const valid =
        s.money >= BUILDING_COST[bt] &&
        !isRiverAt(tx, ty) &&
        !s.buildings.some(b => b.x === tx && b.y === ty) &&
        !s.roads.some(r => r.x === tx && r.y === ty) &&
        !s.farmZones.some(z => z.x === tx && z.y === ty) &&
        (bt !== 'mine' || isOreVeinAt(tx, ty))
      // Hover above terrain surface (mountain or flat ground)
      const baseY = isMountainAt(tx, ty) ? tileH(tx, ty) : 0
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
    ref.current.position.y = moving ? Math.abs(Math.sin(a.time * 9)) * 0.01 : 0
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
  return (
    <group position={[x, 0, y]}>
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
  return (
    <group position={[x, 0, y]}>
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
  return (
    <group position={[x, 0, y]}>
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
  return (
    <group position={[x, 0, y]}>
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
  return (
    <group position={[x, 0, y]}>
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
      if (!raycasterRef.current.ray.intersectPlane(planeRef.current, hitRef.current)) return
      pts.push({ x: hitRef.current.x, y: hitRef.current.z })
    }

    const minX = Math.floor(Math.min(...pts.map(p => p.x)))
    const maxX = Math.ceil(Math.max(...pts.map(p => p.x)))
    const minY = Math.floor(Math.min(...pts.map(p => p.y)))
    const maxY = Math.ceil(Math.max(...pts.map(p => p.y)))

    setViewRect(prev => {
      if (Math.abs(prev.minX - minX) < 1 && Math.abs(prev.maxX - maxX) < 1 && Math.abs(prev.minY - minY) < 1 && Math.abs(prev.maxY - maxY) < 1) {
        return prev
      }
      return { minX, maxX, minY, maxY }
    })
  })

  // Interaction effect (stable, uses refs)
  React.useEffect(() => {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const raycaster = new THREE.Raycaster()
    const intersectPt = new THREE.Vector3()

    function stopDrag() { dragRef.current.active = false; dragRef.current.lastTileKey = ''; dragRef.current.lastTile = null }

    function getTile(e: MouseEvent) {
      const rect = gl.domElement.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera({ x: ndcX, y: ndcY } as any, camera as THREE.Camera)
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
        actionsRef.current.placeBuilding(wx, wy, tool)
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
          // Add a corner tile so diagonal cursor movement still paints 4-neighbor-continuous roads.
          out.push({ x: cur.x, y: prev.y })
        }
        out.push(cur)
      }
      return out
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
      // 若 R3F 对象（建筑/小人）已处理此次点击，则跳过地块逻辑
      if (objectClickedRef.current) { objectClickedRef.current = false; return }
      if ((stateRef.current.selectedTool === 'road' || stateRef.current.selectedTool === 'farmZone') && dragRef.current.didDrag) { dragRef.current.didDrag = false; return }
      const t = getTile(e); if (t) applyTool(t.x, t.y)
    }

    function onMouseDown(e: MouseEvent) {
      if (stateRef.current.selectedTool !== 'road' && stateRef.current.selectedTool !== 'farmZone') return
      dragRef.current.active = true; dragRef.current.didDrag = true; dragRef.current.lastTileKey = ''
      const t = getTile(e); if (!t) return
      dragRef.current.lastTileKey = `${t.x},${t.y}`; dragRef.current.lastTile = t
      if (stateRef.current.selectedTool === 'road') paintRoad(t)
      if (stateRef.current.selectedTool === 'farmZone') paintFarmZone(t)
    }

    function onMouseMove(e: MouseEvent) {
      const tool = stateRef.current.selectedTool
      if ((tool !== 'road' && tool !== 'farmZone') || !dragRef.current.active) return
      const t = getTile(e); if (!t) return
      const key = `${t.x},${t.y}`; if (key === dragRef.current.lastTileKey) return
      const from = dragRef.current.lastTile ?? t
      const path = expandToFourNeighborPath(rasterLine(from, t))
      path.forEach(tool === 'road' ? paintRoad : paintFarmZone)
      dragRef.current.lastTileKey = key; dragRef.current.lastTile = t; dragRef.current.didDrag = true
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
    window.addEventListener('mouseup', () => stopDrag())
    window.addEventListener('blur', () => stopDrag())
    return () => {
      c.removeEventListener('click', onClick)
      c.removeEventListener('mousedown', onMouseDown)
      c.removeEventListener('mousemove', onMouseMoveGhost)
      c.removeEventListener('mouseleave', onMouseLeaveGhost)
      window.removeEventListener('mousemove', onMouseMove)
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

      {/* Placement ghost preview */}
      <PlacementGhost
        tool={state.selectedTool}
        stateRef={stateRef}
        mouseNDCRef={mouseNDCRef}
        mouseOnCanvasRef={mouseOnCanvasRef}
      />
    </group>
  )
}

