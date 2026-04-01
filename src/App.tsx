import React from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { ConfigProvider } from 'antd'
import { SimulationProvider, useSimulation, MAP_SIZE_X, MAP_SIZE_Y, getMountainHeight } from './state/simulation'
import worldGenConfig from './config/world-gen'
import HUD from './ui/HUD'
import MapScene from './scene/MapScene'
import { palette } from './theme/palette'

// Debug: marker that visualizes OrbitControls.target - removed

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
  // NOTE: removed — with screenSpacePanning=false the target.y never drifts during pan,
  // and calling ctrl.update() from inside 'change' was causing the camera to subtly rotate.

  // Disable screen-space panning: pan moves camera in world XZ plane only.
  // This prevents target.y from changing during left-drag, which was the root cause of
  // the "camera rotates while panning" symptom.
  React.useEffect(() => {
    const ctrl = controlsRef.current
    if (ctrl) (ctrl as any).screenSpacePanning = false
  }) // no deps — re-apply every render to be safe (controls may remount)

  const maxDist = Math.max(MAP_SIZE_X, MAP_SIZE_Y) * 2
  return (
    <OrbitControls
      ref={controlsRef}
      enabled={controlsEnabled}
      enablePan={controlsEnabled}
      enableRotate={true}
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
          </Canvas>
        </div>
      </SimulationProvider>
    </ConfigProvider>
  )
}
