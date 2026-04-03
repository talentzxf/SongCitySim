import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SIM_TICK_MS } from '../../config/simulation'
import { palette } from '../../theme/palette'
import { useCharacterAnim, lerpTerrainY } from './_shared'

/** 游商（肩挑货担沿路叫卖） */
export default function PeddlerMesh({ x, y }: { x: number; y: number }) {
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
    ref.current.position.y += Math.sin(a.time * 7) * 0.012
  })

  return (
    <group ref={ref} position={[x, 0, y]} castShadow>
      <mesh position={[0, 0.22, 0]} castShadow>
        <capsuleGeometry args={[0.054, 0.15, 3, 8]} />
        <meshStandardMaterial color="#9c5c20" />
      </mesh>
      <mesh position={[0, 0.37, 0]}>
        <sphereGeometry args={[0.046, 8, 8]} />
        <meshStandardMaterial color={palette.character.skin} />
      </mesh>
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

