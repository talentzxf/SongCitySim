import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SIM_TICK_MS } from '../../config/simulation'
import { palette } from '../../theme/palette'
import { useCharacterAnim, lerpTerrainY } from './_shared'

/** 市场行商（market ↔ 粮仓，肩挑货篓） */
export default function MarketBuyerMesh({ x, y, loaded }: { x: number; y: number; loaded: boolean }) {
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

