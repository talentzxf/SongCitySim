import React from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { ConfigProvider } from 'antd'
import { SimulationProvider, useSimulation, MAP_SIZE_X, MAP_SIZE_Y, getMountainHeight } from './state/simulation'
import worldGenConfig from './config/world-gen'
import HUD from './ui/HUD'
import MapScene from './scene/MapScene'
import { palette } from './theme/palette'

// Debug: marker that visualizes OrbitControls.target
function TargetMarker({ controlsRef }: { controlsRef: React.MutableRefObject<any> }) {
  const ref = React.useRef<THREE.Mesh>(null)
  const plane = React.useRef(new THREE.Plane(new THREE.Vector3(0,1,0), 0))
  const ray = React.useRef(new THREE.Raycaster())
  useFrame(() => {
    const ctrl = controlsRef.current
    if (!ref.current || !ctrl) return
    // Raycast from target x,z downward to place marker on terrain surface (y=tileH or 0)
    const t = (ctrl as any).target as THREE.Vector3
    // do a simple sample: if mountain height exists, use tileH equivalent
    let groundY = 0
    try {
      const mh = getMountainHeight(Math.round(t.x), Math.round(t.z))
      const SCALE = worldGenConfig.mountain.tileScale
      groundY = 0.04 + mh * SCALE
    } catch (e) { groundY = 0 }
    ref.current.position.set(t.x, groundY, t.z)
  })
  return (
    <mesh ref={ref} visible={true}>
      <sphereGeometry args={[0.14, 12, 12]} />
      <meshStandardMaterial color="#ff66aa" emissive="#ff66aa" emissiveIntensity={0.6} />
    </mesh>
  )
}

function ControlsBridge({ controlsRef }: { controlsRef: React.MutableRefObject<any> }) {
  const { state } = useSimulation()
  const controlsEnabled = state.selectedTool === 'pan'
  const mouseButtons = React.useMemo(() => ({ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }), [])

  React.useEffect(() => {
    try {
      ;(window as any).__CONTROLS_STATE__ = { selectedTool: state.selectedTool, enabled: controlsEnabled, canRotate: controlsEnabled }
    } catch (e) {}
  }, [state.selectedTool, controlsEnabled])

  const clampTarget = React.useCallback(() => {
    const ctrl = controlsRef.current
    if (!ctrl || !ctrl.target) return
    const t = ctrl.target as THREE.Vector3
    const cam = (ctrl as any).object as THREE.Camera | undefined
    const halfX = Math.floor(MAP_SIZE_X / 2)
    const halfY = Math.floor(MAP_SIZE_Y / 2)
    const MAP_MIN_X = -halfX, MAP_MAX_X = halfX - 1
    const MAP_MIN_Z = -halfY, MAP_MAX_Z = halfY - 1
    const pad = 0.5
    const nx = Math.max(MAP_MIN_X + pad, Math.min(MAP_MAX_X - pad, t.x))
    const nz = Math.max(MAP_MIN_Z + pad, Math.min(MAP_MAX_Z - pad, t.z))
    if (nx !== t.x || nz !== t.z) {
      const dx = nx - t.x
      const dz = nz - t.z
      t.set(nx, t.y, nz)
      if (cam && (cam as any).position) {
        (cam as any).position.x += dx
        (cam as any).position.z += dz
      }
      if (typeof ctrl.update === 'function') ctrl.update()
    }
  }, [])

  // clampTarget disabled temporarily for debugging zoom behavior
  React.useEffect(() => {
    // no-op while debugging
    return () => {}
  }, [clampTarget])

  React.useEffect(() => { if (controlsEnabled) clampTarget() }, [controlsEnabled, clampTarget])

  // When controls change (pan/rotate/zoom), keep controls.target snapped to ground
  React.useEffect(() => {
    const ctrl = controlsRef.current
    if (!ctrl) return
    function onChange() {
      if (!controlsEnabled) return
      try {
        const t = (ctrl as any).target as THREE.Vector3
        // Snap target y to terrain height at rounded tile coord
        const gx = Math.round(t.x), gz = Math.round(t.z)
        const mh = getMountainHeight(gx, gz) || 0
        const groundY = 0.04 + mh * worldGenConfig.mountain.tileScale
        if (Math.abs(t.y - groundY) > 1e-3) {
          t.y = groundY
          if (typeof ctrl.update === 'function') ctrl.update()
        }
      } catch (e) {}
    }
    ctrl.addEventListener('change', onChange)
    return () => { try { ctrl.removeEventListener('change', onChange) } catch (e) {} }
  }, [controlsEnabled])

  // Use OrbitControls' native wheel handling. Remove custom wheel interception to avoid
  // conflicting updates to controls.target and camera rotation.

  // Visual target marker: render a small sphere at controls.target to help debugging.
  function TargetMarker({ controlsRef }: { controlsRef: React.MutableRefObject<any> }) {
    const ref = React.useRef<THREE.Mesh>(null)
    useFrame(() => {
      const ctrl = controlsRef.current
      if (!ref.current || !ctrl) return
      const t = (ctrl as any).target as THREE.Vector3
      ref.current.position.set(t.x, t.y, t.z)
    })
    return (
      <mesh ref={ref} visible={true}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial color="#ff66aa" emissive="#ff66aa" emissiveIntensity={0.6} />
      </mesh>
    )
  }

  const maxDist = Math.max(MAP_SIZE_X, MAP_SIZE_Y) * 2
  return (
    <OrbitControls
      ref={controlsRef}
      enabled={controlsEnabled}
      enablePan={controlsEnabled}
      enableRotate={controlsEnabled}
      enableZoom={true}
      maxDistance={maxDist}
      mouseButtons={mouseButtons}
    />
  )
}

export default function App() {
  const controlsRef = React.useRef<any>(null)
  return (
    <ConfigProvider
      theme={{ token: { colorPrimary: palette.ui.primary, borderRadius: 10, colorBgContainer: palette.ui.surface } }}
    >
      <SimulationProvider>
        <div className="app-root">
          <HUD />
          <Canvas shadows camera={{ position: [25, 25, 25], fov: 60, near: 0.01 }}>
            <MapScene />
            <ControlsBridge controlsRef={controlsRef} />
            {/* Debug: target marker for OrbitControls */}
            <TargetMarker controlsRef={controlsRef} />
          </Canvas>
        </div>
      </SimulationProvider>
    </ConfigProvider>
  )
}
