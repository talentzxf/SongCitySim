import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from '../../../theme/palette'
import { useSimulation } from '../../../state/simulation'
import type { BuildingMeshProps } from '../_mesh_types'

/**
 * 粮仓 — sturdy storage, minimal night effect (just a guard lamp)
 */
export default function GranaryMesh({ x, y, baseY, level }: BuildingMeshProps) {
  const { state } = useSimulation()
  const matRef = React.useRef<THREE.MeshStandardMaterial>(null)
  const dayRef = React.useRef(state.dayTime)
  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])

  useFrame(() => {
    if (!matRef.current) return
    const t = dayRef.current
    const isNight = t < 0.25 || t > 0.75
    const depth = isNight ? (t > 0.75 ? (t - 0.75) / 0.25 : (0.25 - t) / 0.25) : 0
    matRef.current.emissive.setHex(0xff8800)
    matRef.current.emissiveIntensity = depth * 1.0
  })

  if (level >= 2) {
    // ── 太仓（Level 2）：国家级大型粮储，砖砌高墙连排仓 ──
    return (
      <group position={[x + 0.5, baseY, y + 0.5]}>
        {/* 围墙 */}
        <mesh position={[0, 0.18, 0]}>
          <boxGeometry args={[1.96, 0.36, 1.96]} />
          <meshStandardMaterial color="#b89060" />
        </mesh>
        {/* 三座连排仓体 */}
        {[-0.52, 0, 0.52].map((ox, i) => (
          <mesh key={i} position={[ox, 0.58, 0]} castShadow>
            <boxGeometry args={[0.52, 0.76, 1.60]} />
            <meshStandardMaterial color={palette.building.granaryBody} />
          </mesh>
        ))}
        {/* 三仓屋顶（尖山式） */}
        {[-0.52, 0, 0.52].map((ox, i) => (
          <mesh key={i} position={[ox, 1.06, 0]} rotation={[0, 0, 0]}>
            <coneGeometry args={[0.42, 0.38, 4]} />
            <meshStandardMaterial color={palette.building.granaryRoof} />
          </mesh>
        ))}
        {/* 瓮城门楼 */}
        <mesh position={[0, 0.50, 0.98]} castShadow>
          <boxGeometry args={[0.58, 0.64, 0.08]} />
          <meshStandardMaterial color="#c8a870" />
        </mesh>
        {/* 旗杆 */}
        <mesh position={[0, 1.20, 0.92]}>
          <cylinderGeometry args={[0.025, 0.025, 0.70, 6]} />
          <meshStandardMaterial color="#a08040" />
        </mesh>
        {/* 守仓灯 */}
        <mesh position={[0.88, 0.50, 0.88]} renderOrder={1000}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial ref={matRef} color="#ffaa00" depthTest={false} />
        </mesh>
      </group>
    )
  }

  // ── 常平仓（Level 1） ──
  return (
    <group position={[x + 0.5, baseY, y + 0.5]}>
      {/* 仓体主楼 (2×2 footprint) */}
      <mesh position={[0, 0.36, 0]} castShadow>
        <boxGeometry args={[1.78, 0.72, 1.78]} />
        <meshStandardMaterial color={palette.building.granaryBody} />
      </mesh>

      {/* 四角子仓 */}
      {[[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]].map(([cx, cz], i) => (
        <mesh key={i} position={[cx as number, 0.24, cz as number]} castShadow>
          <boxGeometry args={[0.44, 0.48, 0.44]} />
          <meshStandardMaterial color={palette.building.granaryBody} />
        </mesh>
      ))}

      {/* 主屋顶 */}
      <mesh position={[0, 0.84, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[1.32, 0.56, 4]} />
        <meshStandardMaterial color={palette.building.granaryRoof} />
      </mesh>

      {/* 通气筒 ×4 */}
      {[[-0.52, -0.52], [0.52, -0.52], [-0.52, 0.52], [0.52, 0.52]].map(([cx, cz], i) => (
        <mesh key={i} position={[cx as number, 0.56, cz as number]}>
          <cylinderGeometry args={[0.06, 0.06, 0.20, 8]} />
          <meshStandardMaterial color="#f0d98a" />
        </mesh>
      ))}

      {/* 守仓灯 */}
      <mesh position={[0, 0.72, 0.92]} renderOrder={1000}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial ref={matRef} color="#ffaa00" depthTest={false} />
      </mesh>
    </group>
  )
}
