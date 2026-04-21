import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from '../../theme/palette'
import { useCharacterAnim, lerpTerrainY } from './_shared'

// ─── Seeded random helpers ─────────────────────────────────────────────────
function sr(seed: number, idx: number): number {
  const x = Math.sin(seed * 127.1 + idx * 311.7 + 41.3) * 43758.5453
  return x - Math.floor(x)
}
function pick<T>(seed: number, idx: number, arr: T[]): T {
  return arr[Math.floor(sr(seed, idx) * arr.length)]
}

const ROBE_COLORS   = ['#8b3a3a','#2c5f8a','#3a6b3a','#7a5a1a','#5a3a7a','#8a5a30','#1a5a5a','#7a3a5a']
const HORSE_COLORS  = ['#5a3a20','#3a2810','#8a6a40','#c8a870','#4a3a30','#2a2018']
const MANE_COLORS   = ['#c8a050','#1a1a1a','#8b5e2a','#d4b870','#3a2810']

// ─── Walking migrant ───────────────────────────────────────────────────────

function WalkingMigrant({ x, y, seed }: { x: number; y: number; seed: number }) {
  const { ref, animRef } = useCharacterAnim(x, y)
  const bodyRef = React.useRef<THREE.Mesh>(null)

  const robeColor = pick(seed, 0, ROBE_COLORS)
  const hatColor  = pick(seed, 1, ['#3a2810','#1a3a1a','#2a1a3a','#5a3a10','#1a2a3a'])
  const scale     = 0.82 + sr(seed, 2) * 0.36   // 0.82–1.18
  const fatness   = 0.85 + sr(seed, 3) * 0.30   // body width multiplier
  const tall      = 0.85 + sr(seed, 4) * 0.30   // height multiplier
  // Some carry a bundle (pack on back)
  const hasBundle = sr(seed, 5) > 0.4

  useFrame((_, delta) => {
    if (!ref.current) return
    const a = animRef.current; a.time += delta
    a.elapsedMs += delta * 1000
    const t = Math.min(1, a.elapsedMs / a.tickDuration)
    ref.current.position.x = THREE.MathUtils.lerp(a.startX, a.targetX, t)
    ref.current.position.z = THREE.MathUtils.lerp(a.startY, a.targetY, t)
    const dx = a.targetX - a.startX, dz = a.targetY - a.startY
    const moving = Math.abs(dx) + Math.abs(dz) > 0.001
    if (moving) {
      a.facing = THREE.MathUtils.lerp(a.facing, Math.atan2(dx, dz), Math.min(1, delta * 10))
      ref.current.rotation.y = a.facing
    }
    const stride = moving ? Math.sin(a.time * 9) : 0
    const baseY = lerpTerrainY(a.startX, a.startY, a.targetX, a.targetY, t)
    ref.current.position.y = baseY + (moving ? Math.abs(stride) * 0.014 : 0)
    if (bodyRef.current) bodyRef.current.rotation.z = moving ? Math.sin(a.time * 9) * 0.05 : 0
  })

  const bw = 0.048 * fatness, bh = 0.22 * tall

  return (
    <group ref={ref} position={[x, 0, y]} scale={[scale, scale, scale]}>
      {/* 身体 */}
      <mesh ref={bodyRef} position={[0, 0.19, 0]}>
        <capsuleGeometry args={[bw, bh, 3, 8]} />
        <meshStandardMaterial color={robeColor} />
      </mesh>
      {/* 头 */}
      <mesh position={[0, 0.19 + bh * 0.5 + 0.07, 0]}>
        <sphereGeometry args={[0.048, 10, 10]} />
        <meshStandardMaterial color={palette.character.skin} />
      </mesh>
      {/* 帽 */}
      <mesh position={[0, 0.19 + bh * 0.5 + 0.14, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.08, 0.10, 6]} />
        <meshStandardMaterial color={hatColor} />
      </mesh>
      {/* 行李包袱 */}
      {hasBundle && (
        <mesh position={[0, 0.22, -0.08]}>
          <boxGeometry args={[0.10, 0.10, 0.10]} />
          <meshStandardMaterial color="#c8a050" />
        </mesh>
      )}
    </group>
  )
}

// ─── Horse-riding migrant ──────────────────────────────────────────────────

function HorseMigrant({ x, y, seed }: { x: number; y: number; seed: number }) {
  const { ref, animRef } = useCharacterAnim(x, y)
  const horseRef = React.useRef<THREE.Mesh>(null)
  const riderRef = React.useRef<THREE.Mesh>(null)

  const robeColor  = pick(seed, 0, ROBE_COLORS)
  const horseColor = pick(seed, 6, HORSE_COLORS)
  const maneColor  = pick(seed, 7, MANE_COLORS)
  const scale      = 0.88 + sr(seed, 2) * 0.24  // 0.88–1.12

  useFrame((_, delta) => {
    if (!ref.current) return
    const a = animRef.current; a.time += delta
    a.elapsedMs += delta * 1000
    const t = Math.min(1, a.elapsedMs / a.tickDuration)
    ref.current.position.x = THREE.MathUtils.lerp(a.startX, a.targetX, t)
    ref.current.position.z = THREE.MathUtils.lerp(a.startY, a.targetY, t)
    const dx = a.targetX - a.startX, dz = a.targetY - a.startY
    const moving = Math.abs(dx) + Math.abs(dz) > 0.001
    if (moving) {
      a.facing = THREE.MathUtils.lerp(a.facing, Math.atan2(dx, dz), Math.min(1, delta * 10))
      ref.current.rotation.y = a.facing
    }
    const stride = moving ? Math.sin(a.time * 14) : 0
    const baseY = lerpTerrainY(a.startX, a.startY, a.targetX, a.targetY, t)
    ref.current.position.y = baseY + (moving ? 0.015 + Math.abs(stride) * 0.025 : 0)
    if (horseRef.current) horseRef.current.rotation.z = moving ? Math.sin(a.time * 14) * 0.05 : 0
    if (riderRef.current) {
      riderRef.current.position.y = 0.44 + (moving ? Math.cos(a.time * 14) * 0.018 : 0)
      riderRef.current.rotation.z = moving ? Math.sin(a.time * 7) * 0.04 : 0
    }
  })

  return (
    <group ref={ref} position={[x, 0, y]} scale={[scale, scale, scale]}>
      <group>
        {/* 马身 */}
        <mesh ref={horseRef} position={[0, 0.18, 0]} castShadow>
          <boxGeometry args={[0.18, 0.22, 0.38]} />
          <meshStandardMaterial color={horseColor} />
        </mesh>
        {/* 马头 */}
        <mesh position={[0, 0.26, 0.22]} castShadow>
          <boxGeometry args={[0.14, 0.14, 0.14]} />
          <meshStandardMaterial color={horseColor} />
        </mesh>
        {/* 马鼻 */}
        <mesh position={[0, 0.21, 0.32]}>
          <boxGeometry args={[0.10, 0.09, 0.06]} />
          <meshStandardMaterial color={horseColor} />
        </mesh>
        {/* 马颈鬃 */}
        <mesh position={[0, 0.30, 0.16]} rotation={[-0.3, 0, 0]}>
          <boxGeometry args={[0.06, 0.20, 0.08]} />
          <meshStandardMaterial color={maneColor} />
        </mesh>
        {/* 马鞍 */}
        <mesh position={[0, 0.30, -0.06]}>
          <boxGeometry args={[0.20, 0.07, 0.18]} />
          <meshStandardMaterial color={palette.character.saddle} />
        </mesh>
        {/* 马尾 */}
        <mesh position={[0, 0.22, -0.22]} rotation={[0.4, 0, 0]}>
          <boxGeometry args={[0.05, 0.14, 0.06]} />
          <meshStandardMaterial color={maneColor} />
        </mesh>
        {/* 骑手身体 */}
        <mesh ref={riderRef} position={[0, 0.44, -0.04]}>
          <capsuleGeometry args={[0.05, 0.15, 3, 8]} />
          <meshStandardMaterial color={robeColor} />
        </mesh>
        {/* 骑手头 */}
        <mesh position={[0, 0.60, -0.04]}>
          <sphereGeometry args={[0.045, 10, 10]} />
          <meshStandardMaterial color={palette.character.skin} />
        </mesh>
        {/* 骑手帽 */}
        <mesh position={[0, 0.67, -0.04]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.09, 0.12, 6]} />
          <meshStandardMaterial color={palette.character.hat} />
        </mesh>
      </group>
    </group>
  )
}

// ─── Main export: pick variant by seed ────────────────────────────────────

/** 移民入城 — 骑马或步行，外貌由 seed 决定 */
export default function MigrantHorse({ x, y, seed }: { x: number; y: number; seed: number }) {
  // ~55% ride horses, ~45% walk
  const onHorse = sr(seed, 9) > 0.45
  return onHorse
    ? <HorseMigrant x={x} y={y} seed={seed} />
    : <WalkingMigrant x={x} y={y} seed={seed} />
}
