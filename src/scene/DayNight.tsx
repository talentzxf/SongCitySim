/**
 * Day/Night lighting system.
 * DayNightLighting — ambient + directional lights that track dayTime.
 * NightOverlay     — dark translucent plane layered over the scene at night.
 */
import React from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimulation } from '../state/simulation'

export function DayNightLighting() {
  const { state } = useSimulation()
  const { scene } = useThree()
  const dayRef = React.useRef(state.dayTime)
  const ambRef = React.useRef<THREE.AmbientLight>(null)
  const dirRef = React.useRef<THREE.DirectionalLight>(null)

  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])

  useFrame(() => {
    const t = dayRef.current
    const sunHeight = Math.sin((t * 2 - 0.5) * Math.PI)
    const sun       = Math.max(0, sunHeight)
    const twilight  = 1 - Math.abs(sunHeight)
    const dayFraction = Math.max(0, Math.min(1, (t - 0.25) / 0.5))

    if (ambRef.current) {
      ambRef.current.intensity = 0.15 + twilight * 0.12 + sun * 0.67
      const dc = Math.min(1, twilight + sun)
      ambRef.current.color.setHSL(0.62 - dc * 0.52, 0.35 - dc * 0.25, 0.40 + dc * 0.60)
    }
    if (dirRef.current) {
      dirRef.current.intensity = 0.18 + twilight * 0.17 + sun * 1.02
      if (sun > 0.01) {
        const sx = Math.cos(dayFraction * Math.PI - Math.PI / 2) * 50
        const sy = Math.sin(dayFraction * Math.PI) * 60 + 5
        dirRef.current.position.set(sx, sy, 40)
      } else {
        dirRef.current.position.set(-40, 50, -30)
      }
      const dc = Math.min(1, twilight + sun)
      dirRef.current.color.setHSL(0.63 - dc * 0.55, 0.15 + dc * 0.35, 0.90 + sun * 0.05)
    }
    const skyH = 0.63 - twilight * 0.59 - sun * 0.05
    const skyS = 0.65 - twilight * 0.10 + sun * 0.25
    const skyL = 0.04 + twilight * 0.34 + sun * 0.66
    scene.background = new THREE.Color().setHSL(skyH, skyS, skyL)
  })

  return (
    <>
      <ambientLight ref={ambRef} intensity={0.5} />
      <directionalLight ref={dirRef} castShadow position={[30, 50, 40]} intensity={0.8}
        shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
    </>
  )
}

export function NightOverlay() {
  const { state } = useSimulation()
  const ref = React.useRef<THREE.Mesh>(null)
  const dayRef = React.useRef(state.dayTime)
  React.useEffect(() => { dayRef.current = state.dayTime }, [state.dayTime])

  useFrame(() => {
    if (!ref.current) return
    const t = dayRef.current
    const mat = ref.current.material as THREE.MeshBasicMaterial
    let opacity = 0
    if (t >= 0.25 && t <= 0.75) {
      const sun = Math.sin(((t - 0.25) / 0.5) * Math.PI)
      opacity = (1 - sun) * 0.14
    } else {
      const n = t < 0.25 ? (0.25 - t) / 0.25 : (t - 0.75) / 0.25
      opacity = 0.14 + n * 0.38
    }
    mat.opacity = Math.min(0.52, opacity)
  })

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} renderOrder={999} raycast={() => {}}>
      <planeGeometry args={[400, 400]} />
      <meshBasicMaterial color="#00061a" transparent opacity={0} depthTest={false} depthWrite={false} />
    </mesh>
  )
}

