import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimulation } from '../../../state/simulation'
import type { BuildingMeshProps } from '../_mesh_types'

/**
 * 宅邸（园林大院）—— 2×2 占地
 * 由主楼 + 翼廊 + 园墙 + 月亮门 + 小亭组成，夜晚有暖黄灯笼光
 */
export default function ManorMesh({ x, y, baseY, occupants }: BuildingMeshProps) {
  const { state } = useSimulation()
  const dayRef = React.useRef(state.dayTime)
  const occRef = React.useRef(occupants)
  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])
  React.useEffect(() => { occRef.current = occupants }, [occupants])

  // 四盏灯笼材质 ref
  const lanternRefs = [
    React.useRef<THREE.MeshStandardMaterial>(null),
    React.useRef<THREE.MeshStandardMaterial>(null),
    React.useRef<THREE.MeshStandardMaterial>(null),
    React.useRef<THREE.MeshStandardMaterial>(null),
  ]

  const mainWallRef  = React.useRef<THREE.MeshStandardMaterial>(null)
  const roofRef      = React.useRef<THREE.MeshStandardMaterial>(null)

  useFrame(() => {
    const t       = dayRef.current
    const isNight = t < 0.25 || t > 0.75
    const depth   = isNight
      ? (t > 0.75 ? (t - 0.75) / 0.25 : (0.25 - t) / 0.25)
      : 0
    const hasOcc  = occRef.current > 0
    for (const ref of lanternRefs) {
      if (!ref.current) continue
      if (isNight && hasOcc) {
        ref.current.emissive.setHex(0xff9900)
        ref.current.emissiveIntensity = depth * 4.0
      } else {
        ref.current.emissiveIntensity = 0
      }
    }
    if (mainWallRef.current) {
      mainWallRef.current.emissiveIntensity = isNight && hasOcc ? depth * 0.5 : 0
    }
  })

  // Manor is 2×2; center at (x+0.5, z+0.5) relative to tile origin
  const cx = x + 0.5
  const cz = y + 0.5

  return (
    <group position={[cx, baseY, cz]}>
      {/* ── 围墙 ── */}
      {/* 南墙 */}
      <mesh position={[0, 0.22, -0.95]} castShadow receiveShadow>
        <boxGeometry args={[2.0, 0.44, 0.08]} />
        <meshStandardMaterial color="#d4c8a0" />
      </mesh>
      {/* 北墙 */}
      <mesh position={[0, 0.22, 0.95]} castShadow receiveShadow>
        <boxGeometry args={[2.0, 0.44, 0.08]} />
        <meshStandardMaterial color="#d4c8a0" />
      </mesh>
      {/* 西墙 */}
      <mesh position={[-0.95, 0.22, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.08, 0.44, 2.0]} />
        <meshStandardMaterial color="#d4c8a0" />
      </mesh>
      {/* 东墙 */}
      <mesh position={[0.95, 0.22, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.08, 0.44, 2.0]} />
        <meshStandardMaterial color="#d4c8a0" />
      </mesh>

      {/* ── 主楼（居中，偏北） ── */}
      {/* 主楼墙体 */}
      <mesh position={[0, 0.55, 0.18]} castShadow receiveShadow>
        <boxGeometry args={[1.3, 1.1, 0.9]} />
        <meshStandardMaterial ref={mainWallRef} color="#e8dbc0" emissive={new THREE.Color(0xffcc44)} emissiveIntensity={0} />
      </mesh>
      {/* 主楼屋顶（歇山式，双层） */}
      <mesh position={[0, 1.28, 0.18]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.98, 0.62, 4]} />
        <meshStandardMaterial ref={roofRef} color="#2e3535" />
      </mesh>
      {/* 下层屋檐 */}
      <mesh position={[0, 1.05, 0.18]} castShadow>
        <boxGeometry args={[1.55, 0.06, 1.12]} />
        <meshStandardMaterial color="#3a4a3a" />
      </mesh>

      {/* ── 东厢房 ── */}
      <mesh position={[0.60, 0.40, -0.28]} castShadow receiveShadow>
        <boxGeometry args={[0.55, 0.80, 0.55]} />
        <meshStandardMaterial color="#ddd0a8" />
      </mesh>
      <mesh position={[0.60, 0.90, -0.28]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.45, 0.38, 4]} />
        <meshStandardMaterial color="#3a4545" />
      </mesh>

      {/* ── 西厢房 ── */}
      <mesh position={[-0.60, 0.40, -0.28]} castShadow receiveShadow>
        <boxGeometry args={[0.55, 0.80, 0.55]} />
        <meshStandardMaterial color="#ddd0a8" />
      </mesh>
      <mesh position={[-0.60, 0.90, -0.28]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.45, 0.38, 4]} />
        <meshStandardMaterial color="#3a4545" />
      </mesh>

      {/* ── 月亮门（南入口） ── */}
      <mesh position={[0, 0.30, -0.92]} castShadow>
        <torusGeometry args={[0.20, 0.045, 10, 24, Math.PI]} />
        <meshStandardMaterial color="#c8a060" />
      </mesh>
      {/* 门洞横梁 */}
      <mesh position={[0, 0.09, -0.92]}>
        <boxGeometry args={[0.40, 0.045, 0.05]} />
        <meshStandardMaterial color="#b08040" />
      </mesh>

      {/* ── 小庭院亭子 ── */}
      <mesh position={[0, 0.15, -0.45]} castShadow receiveShadow>
        <cylinderGeometry args={[0.10, 0.10, 0.30, 6]} />
        <meshStandardMaterial color="#8b6040" />
      </mesh>
      <mesh position={[0, 0.42, -0.45]} rotation={[0, Math.PI / 6, 0]} castShadow>
        <coneGeometry args={[0.30, 0.20, 6]} />
        <meshStandardMaterial color="#4a3a28" />
      </mesh>

      {/* ── 四盏灯笼（夜晚发光） ── */}
      {[
        [-0.52,  0.78, -0.62],
        [ 0.52,  0.78, -0.62],
        [-0.52,  0.78,  0.60],
        [ 0.52,  0.78,  0.60],
      ].map(([lx, ly, lz], i) => (
        <mesh key={i} position={[lx, ly, lz]} castShadow>
          <sphereGeometry args={[0.055, 8, 8]} />
          <meshStandardMaterial
            ref={lanternRefs[i]}
            color="#ff9900"
            emissive={new THREE.Color(0xff9900)}
            emissiveIntensity={0}
          />
        </mesh>
      ))}

      {/* ── 院内树（装饰） ── */}
      <mesh position={[-0.62, 0.28, 0.55]} castShadow>
        <cylinderGeometry args={[0.04, 0.06, 0.56, 5]} />
        <meshStandardMaterial color="#5a3c1e" />
      </mesh>
      <mesh position={[-0.62, 0.70, 0.55]} castShadow>
        <sphereGeometry args={[0.22, 8, 6]} />
        <meshStandardMaterial color="#2e5e28" />
      </mesh>
      <mesh position={[0.62, 0.28, 0.55]} castShadow>
        <cylinderGeometry args={[0.04, 0.06, 0.56, 5]} />
        <meshStandardMaterial color="#5a3c1e" />
      </mesh>
      <mesh position={[0.62, 0.70, 0.55]} castShadow>
        <sphereGeometry args={[0.22, 8, 6]} />
        <meshStandardMaterial color="#336628" />
      </mesh>
    </group>
  )
}

