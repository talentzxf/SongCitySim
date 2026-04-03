import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from '../../../theme/palette'
import { useSimulation } from '../../../state/simulation'
import type { BuildingMeshProps } from '../_mesh_types'

/**
 * 集市
 * Night effect: dim banner + faint lantern glow when has workers
 */
export default function MarketMesh({ x, y, baseY, occupants }: BuildingMeshProps) {
  const { state } = useSimulation()
  const matRef = React.useRef<THREE.MeshStandardMaterial>(null)
  const dayRef = React.useRef(state.dayTime)
  const occRef = React.useRef(occupants)
  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])
  React.useEffect(() => { occRef.current = occupants },     [occupants])

  useFrame(() => {
    if (!matRef.current) return
    const t = dayRef.current
    const isNight = t < 0.25 || t > 0.75
    const depth = isNight ? (t > 0.75 ? (t - 0.75) / 0.25 : (0.25 - t) / 0.25) : 0
    matRef.current.emissive.setHex(0xff3300)
    matRef.current.emissiveIntensity = (occRef.current > 0 ? depth * 1.4 : depth * 0.4)
  })

  return (
    <group position={[x, baseY, y]}>
      {/* 主体 */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[0.9, 0.5, 0.9]} />
        <meshStandardMaterial color={palette.building.marketBody} />
      </mesh>

      {/* 招牌横幅 */}
      <mesh position={[0, 0.65, 0]}>
        <boxGeometry args={[0.9, 0.14, 0.1]} />
        <meshStandardMaterial color={palette.building.marketAccent} />
      </mesh>

      {/* 门口灯笼 */}
      <mesh position={[0, 0.5, 0.47]} renderOrder={1000}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial ref={matRef} color="#ff5500" depthTest={false} />
      </mesh>
    </group>
  )
}
