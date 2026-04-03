import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { palette } from '../../../theme/palette'

/** 农民在田间劳作（锄地动画） */
export default function FarmerAtWork({ x, y, seed, selected, onClick }: {
  x: number; y: number; seed: number; selected?: boolean; onClick?: (e: any) => void
}) {
  const bodyRef = React.useRef<THREE.Group>(null)
  const timeRef = React.useRef(seed * 0.7)

  useFrame((_, delta) => {
    timeRef.current += delta
    if (bodyRef.current) {
      bodyRef.current.rotation.x = -0.28 + Math.sin(timeRef.current * 1.4) * 0.12
    }
  })

  const ox = Math.sin(seed * 0.73) * 0.55
  const oz = Math.cos(seed * 1.31) * 0.55

  return (
    <group position={[x + ox, 0, y + oz]} onClick={onClick}>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.46, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group ref={bodyRef} rotation={[-0.28, 0, 0]}>
        <mesh position={[0, 0.15, 0]}>
          <capsuleGeometry args={[0.042, 0.13, 3, 8]} />
          <meshStandardMaterial color="#7c9a50" />
        </mesh>
        <mesh position={[0, 0.30, 0]}>
          <sphereGeometry args={[0.043, 10, 10]} />
          <meshStandardMaterial color={palette.character.skin} />
        </mesh>
        {/* 草帽帽檐 */}
        <mesh position={[0, 0.36, 0]}>
          <cylinderGeometry args={[0.13, 0.14, 0.035, 10]} />
          <meshStandardMaterial color="#c8a838" />
        </mesh>
        {/* 草帽帽顶 */}
        <mesh position={[0, 0.40, 0]}>
          <cylinderGeometry args={[0.058, 0.068, 0.09, 8]} />
          <meshStandardMaterial color="#c8a838" />
        </mesh>
        {/* 锄头把 */}
        <mesh position={[0.09, 0.12, -0.14]} rotation={[0.65, 0.15, 0]}>
          <boxGeometry args={[0.018, 0.24, 0.018]} />
          <meshStandardMaterial color="#7a4020" />
        </mesh>
        {/* 锄头刃 */}
        <mesh position={[0.09, 0.01, 0.02]} rotation={[0.8, 0, 0]}>
          <boxGeometry args={[0.12, 0.022, 0.022]} />
          <meshStandardMaterial color="#909090" />
        </mesh>
      </group>
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.14, 0.18, 20]} />
          <meshBasicMaterial color="#52c41a" />
        </mesh>
      )}
    </group>
  )
}

