import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from '../../theme/palette'
import { useCharacterAnim, tileH, SMOOTH } from './_shared'

/** 通勤步行市民（上下班途中）及巡逻兵 */
export default function CommutingWalker({ x, y, purpose, selected, onClick }: {
  x: number; y: number
  purpose: 'toWork' | 'toHome' | 'toShop' | 'fromShop' | 'patrol'
  selected?: boolean
  onClick?: (e: any) => void
}) {
  const { ref, animRef } = useCharacterAnim(x, y)
  const bodyRef = React.useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (!ref.current) return
    const a = animRef.current
    a.time += delta

    // Exponential smooth chase toward 1-tick-ahead target
    const px = ref.current.position.x, pz = ref.current.position.z
    const f = Math.min(1, SMOOTH * delta)
    const newX = px + (a.targetX - px) * f
    const newZ = pz + (a.targetY - pz) * f
    const dx = newX - px, dz = newZ - pz
    ref.current.position.x = newX
    ref.current.position.z = newZ

    const moving = Math.abs(dx) + Math.abs(dz) > 0.0001
    if (moving) {
      a.facing = THREE.MathUtils.lerp(a.facing, Math.atan2(dx, dz), Math.min(1, delta * 15))
      ref.current.rotation.y = a.facing
    }
    const stride = moving ? Math.sin(a.time * 10) : 0
    ref.current.position.y = tileH(Math.round(newX), Math.round(newZ)) + (moving ? Math.abs(stride) * 0.012 : 0)
    if (bodyRef.current) bodyRef.current.rotation.z = moving ? Math.sin(a.time * 10) * 0.06 : 0
  })

  const robeColor = purpose === 'patrol' ? '#cc2200' : purpose === 'toWork' ? palette.character.robe : palette.character.robeAccent

  return (
    <group ref={ref} position={[x, 0, y]} onClick={onClick}>
      {/* Hit cylinder: tall (top y=0.80) so it's easy to tap from isometric view */}
      <mesh position={[0, 0.40, 0]}>
        <cylinderGeometry args={[0.38, 0.38, 0.80, 8]} />
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
