import React from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { ConfigProvider } from 'antd'
import { SimulationProvider, useSimulation } from './state/simulation'
import HUD from './ui/HUD'
import MapScene from './scene/MapScene'
import { palette } from './theme/palette'

function ControlsBridge() {
  const { state } = useSimulation()
  const controlsEnabled = state.selectedTool === 'pan'
  const mouseButtons = React.useMemo(
    () => ({
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    }),
    []
  )

  React.useEffect(() => {
    try {
      ;(window as any).__CONTROLS_STATE__ = {
        selectedTool: state.selectedTool,
        enabled: controlsEnabled,
        canRotate: controlsEnabled,
      }
    } catch (e) {
      // ignore in non-browser environments
    }
  }, [state.selectedTool, controlsEnabled])

  return (
    <OrbitControls
      enabled={controlsEnabled}
      enablePan={controlsEnabled}
      enableRotate={controlsEnabled}
      enableZoom={true}
      mouseButtons={mouseButtons}
    />
  )
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: palette.ui.primary,
          borderRadius: 10,
          colorBgContainer: palette.ui.surface,
        },
      }}
    >
      <SimulationProvider>
        <div className="app-root">
          <HUD />
          <Canvas shadows camera={{ position: [25, 25, 25], fov: 60 }}>
            <MapScene />
            <ControlsBridge />
          </Canvas>
        </div>
      </SimulationProvider>
    </ConfigProvider>
  )
}
