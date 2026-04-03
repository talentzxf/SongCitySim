import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from '../../../theme/palette'
import { useSimulation } from '../../../state/simulation'
import type { BuildingMeshProps } from '../_mesh_types'

/**
 * 寺庙
 * Night effect: candle glow at spire base + golden tip brightens
 */
export default function TempleMesh({ x, y, baseY }: BuildingMeshProps) {
  const { state } = useSimulation()
  const spireRef  = React.useRef<THREE.MeshStandardMaterial>(null)
  const candleRef = React.useRef<THREE.MeshStandardMaterial>(null)
  const dayRef    = React.useRef(state.dayTime)
  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])

  useFrame(({ clock }) => {
    const t = dayRef.current
    const isNight = t < 0.25 || t > 0.75
    const depth = isNight ? (t > 0.75 ? (t - 0.75) / 0.25 : (0.25 - t) / 0.25) : 0
    const flicker = 1 + Math.sin(clock.elapsedTime * 3.5) * 0.12
    if (spireRef.current)  { spireRef.current.emissive.setHex(0xffcc00);  spireRef.current.emissiveIntensity  = depth * 1.3 }
    if (candleRef.current) { candleRef.current.emissive.setHex(0xffaa00); candleRef.current.emissiveIntensity = depth * flicker }
  })

  return (
    <group position={[x, baseY, y]}>
      {/* 台基 */}
      <mesh position={[0, 0.08, 0]} castShadow>
        <boxGeometry args={[1.05, 0.16, 1.05]} />
        <meshStandardMaterial color="#c8b060" />
      </mesh>

      {/* 正殿 */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.88, 0.54, 0.88]} />
        <meshStandardMaterial color={palette.building.templeBody} />
      </mesh>

      {/* 屋顶 */}
      <mesh position={[0, 0.9, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.78, 0.6, 4]} />
        <meshStandardMaterial color={palette.building.templeRoof} />
      </mesh>

      {/* 宝刹 */}
      <mesh position={[0, 1.3, 0]}>
        <coneGeometry args={[0.06, 0.32, 6]} />
        <meshStandardMaterial ref={spireRef} color="#d4a820" />
      </mesh>

      {/* 香烛 */}
      <mesh position={[0, 0.18, 0.45]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial ref={candleRef} color="#ffdd88" />
      </mesh>
    </group>
  )
}
