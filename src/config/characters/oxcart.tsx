import React from 'react'
import { useFrame } from '@react-three/fiber'
import { useCharacterAnim, tileH } from './_shared'

/** 粮仓牛车（granary ↔ 农场往返） */
export default function OxCartMesh({ x, y, loaded }: { x: number; y: number; loaded: boolean }) {
  const { ref, animRef } = useCharacterAnim(x, y)
  // Track last known target to detect movement direction each sim tick
  const prevTarget = React.useRef({ x, y })

  useFrame((_, delta) => {
    if (!ref.current) return
    const a = animRef.current; a.time += delta

    // Detect when target changes (once per sim tick) and snap facing toward movement direction
    if (a.targetX !== prevTarget.current.x || a.targetY !== prevTarget.current.y) {
      const mdx = a.targetX - prevTarget.current.x
      const mdz = a.targetY - prevTarget.current.y
      if (Math.abs(mdx) + Math.abs(mdz) > 0.001) {
        // Snap facing immediately to the correct direction — no lerp lag
        a.facing = Math.atan2(mdx, mdz)
      }
      prevTarget.current = { x: a.targetX, y: a.targetY }
    }

    // Smooth position toward target (exponential decay)
    const px = ref.current.position.x, pz = ref.current.position.z
    const f = Math.min(1, 10 * delta)
    ref.current.position.x = px + (a.targetX - px) * f
    ref.current.position.z = pz + (a.targetY - pz) * f
    ref.current.position.y = tileH(Math.round(ref.current.position.x), Math.round(ref.current.position.z))
    ref.current.rotation.y = a.facing
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
