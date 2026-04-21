import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useCharacterAnim, tileH, SMOOTH } from './_shared'

/** 粮仓牛车（granary ↔ 农场往返） */
export default function OxCartMesh({ x, y, loaded }: { x: number; y: number; loaded: boolean }) {
  const { ref, animRef } = useCharacterAnim(x, y)

  useFrame((_, delta) => {
    if (!ref.current) return
    const a = animRef.current; a.time += delta
    const px = ref.current.position.x, pz = ref.current.position.z
    const f = Math.min(1, SMOOTH * delta)
    const newX = px + (a.targetX - px) * f
    const newZ = pz + (a.targetY - pz) * f
    const dx = newX - px, dz = newZ - pz
    ref.current.position.x = newX
    ref.current.position.z = newZ
    ref.current.position.y = tileH(Math.round(newX), Math.round(newZ))
    if (Math.abs(dx) + Math.abs(dz) > 0.0001) {
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
      {/* 犄角左 */}
      <mesh position={[-0.1, 0.32, 0.36]} rotation={[0, 0, 0.5]}>
        <cylinderGeometry args={[0.01, 0.015, 0.1, 5]} />
        <meshStandardMaterial color="#d8c090" />
      </mesh>
      {/* 犄角右 */}
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
      {loaded && (
        <mesh position={[0, 0.2, -0.15]}>
          <boxGeometry args={[0.3, 0.18, 0.36]} />
          <meshStandardMaterial color="#d4a820" />
        </mesh>
      )}
    </group>
  )
}
