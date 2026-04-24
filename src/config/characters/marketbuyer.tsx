import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from '../../theme/palette'
import { useCharacterAnim, tileH } from './_shared'

/** 市场行商（market ↔ 粮仓，肩挑货篓） */
export default function MarketBuyerMesh({ x, y, loaded }: { x: number; y: number; loaded: boolean }) {
  const { ref, animRef } = useCharacterAnim(x, y)
  const bodyRef = React.useRef<THREE.Mesh>(null)
  const prevTarget = React.useRef({ x, y })

  useFrame((_, delta) => {
    if (!ref.current) return
    const a = animRef.current; a.time += delta

    // Snap facing to movement direction when target changes (per sim tick)
    if (a.targetX !== prevTarget.current.x || a.targetY !== prevTarget.current.y) {
      const mdx = a.targetX - prevTarget.current.x
      const mdz = a.targetY - prevTarget.current.y
      if (Math.abs(mdx) + Math.abs(mdz) > 0.001) {
        a.facing = Math.atan2(mdx, mdz)
      }
      prevTarget.current = { x: a.targetX, y: a.targetY }
    }

    const px = ref.current.position.x, pz = ref.current.position.z
    const f = Math.min(1, 10 * delta)
    const newX = px + (a.targetX - px) * f
    const newZ = pz + (a.targetY - pz) * f
    const dx = newX - px, dz = newZ - pz
    ref.current.position.x = newX
    ref.current.position.z = newZ
    const moving = Math.abs(dx) + Math.abs(dz) > 0.0001
    ref.current.rotation.y = a.facing
    ref.current.position.y = tileH(Math.round(newX), Math.round(newZ)) + (moving ? Math.abs(Math.sin(a.time * 9)) * 0.01 : 0)
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
