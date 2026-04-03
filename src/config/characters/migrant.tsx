import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SIM_TICK_MS } from '../../config/simulation'
import { palette } from '../../theme/palette'
import { useCharacterAnim, lerpTerrainY } from './_shared'

/** 移民骑马进城 */
export default function MigrantHorse({ x, y }: { x: number; y: number }) {
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
    if (riderRef.current) {
      riderRef.current.position.y = 0.36 + (moving ? Math.cos(a.time * 14) * 0.018 : 0)
      riderRef.current.rotation.z = moving ? Math.sin(a.time * 7) * 0.04 : 0
    }
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

