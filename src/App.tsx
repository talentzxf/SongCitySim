import React from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { ConfigProvider, App as AntdApp } from 'antd'
import { SimulationProvider, useSimulation, MAP_SIZE_X, MAP_SIZE_Y } from './state/simulation'
import HUD from './ui/HUD'
import MapScene from './scene/MapScene'
import LoadingScreen from './ui/LoadingScreen'
import LevelSelect from './levels/LevelSelect'
import LevelIntro from './levels/LevelIntro'
import Tutorial from './levels/Tutorial'
import LEVELS from './levels/levelsData'
import { LevelProvider } from './levels/LevelContext'
import type { MapBounds } from './levels/levelsData'
import { palette } from './theme/palette'

// Bridges the antd App.useApp() message API to window.__MESSAGE_API__ so that
// components inside R3F <Canvas> (a separate React reconciler) can use it
// consistently with the existing window bridge pattern (__THREE_CONTROLS__ etc.)
function MessageBridge() {
  const { message } = AntdApp.useApp()
  React.useEffect(() => {
    ;(window as any).__MESSAGE_API__ = message
  }, [message])
  return null
}

// Debug: marker that visualizes OrbitControls.target - removed

function ControlsBridge({ controlsRef, bounds }: { controlsRef: React.MutableRefObject<any>; bounds: MapBounds }) {
  const { state } = useSimulation()

  // Detect touch/mobile device (once, stable)
  const isTouch = React.useMemo(() =>
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0), [])

  // On desktop: disable controls whenever a non-pan tool is active (mouse events handled by MapScene).
  // On mobile:  keep controls enabled even for non-pan tools so the user can still pinch-zoom /
  //             two-finger rotate/pan to position themselves before confirming placement.
  //             Single-finger events for the active tool are intercepted in capture-phase by
  //             MapScene's touch handlers (they call e.preventDefault + e.stopPropagation) so
  //             OrbitControls never sees them.
  const isPanTool       = state.selectedTool === 'pan'
  const controlsEnabled = isPanTool || isTouch

  // Desktop: left-click = pan camera, right-click = rotate
  // Mobile:  1-finger = pan, 2-finger = dolly+rotate
  const mouseButtons = React.useMemo(
    () => ({ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }),
    [],
  )
  const touchConfig = React.useMemo(
    () => ({ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }),
    [],
  )

  React.useEffect(() => {
    try {
      ;(window as any).__CONTROLS_STATE__ = { selectedTool: state.selectedTool, enabled: controlsEnabled, canRotate: controlsEnabled }
      ;(window as any).__IS_TOUCH_DEVICE__ = isTouch
    } catch (e) {}
  }, [state.selectedTool, controlsEnabled, isPanTool, isTouch])

  const clampTarget = React.useCallback(() => {
    const ctrl = controlsRef.current
    if (!ctrl || !ctrl.target) return
    const t = ctrl.target as THREE.Vector3
    const cam = (ctrl as any).object as THREE.Camera | undefined
    const pad = 0.5
    const nx = Math.max(bounds.minX + pad, Math.min(bounds.maxX - pad, t.x))
    const nz = Math.max(bounds.minY + pad, Math.min(bounds.maxY - pad, t.z))
    if (nx !== t.x || nz !== t.z) {
      const dx = nx - t.x, dz = nz - t.z
      t.set(nx, t.y, nz)
      if (cam && (cam as any).position) {
        const pos = (cam as any).position as { x: number; z: number }
        pos.x += dx; pos.z += dz
      }
      if (typeof ctrl.update === 'function') ctrl.update()
    }
  }, [bounds])

  // Expose bounds to window so MapScene can read them
  React.useEffect(() => {
    try { (window as any).__LEVEL_BOUNDS__ = bounds } catch {}
  }, [bounds])

  React.useEffect(() => { if (controlsEnabled) clampTarget() }, [controlsEnabled, isPanTool, clampTarget])

  React.useEffect(() => {
    const ctrl = controlsRef.current
    if (ctrl) (ctrl as any).screenSpacePanning = false
    try { if (ctrl) (window as any).__THREE_CONTROLS__ = ctrl } catch {}
  })

  // On bounds change, immediately fly camera target to centre of bounds
  React.useEffect(() => {
    const ctrl = controlsRef.current
    if (!ctrl) return
    const cx = (bounds.minX + bounds.maxX) / 2
    const cz = (bounds.minY + bounds.maxY) / 2
    // Camera height: lower for small areas, higher for large ones
    const span  = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
    const camH  = Math.max(6, span * 0.22)
    const camOff = camH * 2.2   // wide horizontal offset → low oblique angle
    ctrl.target.set(cx, 0, cz)
    if (ctrl.object) {
      ctrl.object.position.set(cx + camOff, camH, cz + camOff)
    }
    if (typeof ctrl.update === 'function') ctrl.update()
  }, [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY]) // eslint-disable-line

  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
  return (
    <OrbitControls
      ref={controlsRef}
      enabled={controlsEnabled}
      enablePan={isPanTool}
      enableRotate={true}
      enableZoom={true}
      maxDistance={span * 2}
      mouseButtons={mouseButtons}
      touches={touchConfig}
    />
  )
}

// ─── App-level screen state ───────────────────────────────────────────────────
type Screen = 'loading' | 'level-select' | 'level-intro' | 'game'

const FULL_BOUNDS: MapBounds = {
  minX: -Math.floor(MAP_SIZE_X / 2),
  maxX:  Math.floor(MAP_SIZE_X / 2) - 1,
  minY: -Math.floor(MAP_SIZE_Y / 2),
  maxY:  Math.floor(MAP_SIZE_Y / 2) - 1,
}

export default function App() {
  const controlsRef = React.useRef<any>(null)
  const [ready, setReady] = React.useState(false)
  const [screen, setScreen] = React.useState<Screen>('loading')
  const [activeLevelId, setActiveLevelId] = React.useState<string | null>(null)
  const [cityName, setCityName] = React.useState<string>('定朔城')
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const [tutorialDone, setTutorialDone] = React.useState(false)
  const showTutorial = screen === 'game' && activeLevelId === 'l01' && !tutorialDone

  const activeLevel = React.useMemo(
    () => activeLevelId ? (LEVELS.find(l => l.id === activeLevelId) ?? null) : null,
    [activeLevelId],
  )

  React.useEffect(() => {
    const id = setTimeout(() => setReady(true), 600)
    return () => clearTimeout(id)
  }, [])

  const handleMode = (mode: 'campaign' | 'sandbox' | 'load') => {
    if (mode === 'campaign') {
      setScreen('level-select')
    } else if (mode === 'load') {
      fileInputRef.current?.click()
      setActiveLevelId(null)
      setScreen('game')
    } else {
      setActiveLevelId(null)
      setScreen('game')
    }
  }

  const handleStartLevel = (levelId: string) => {
    setActiveLevelId(levelId)
    const lvl = LEVELS.find(l => l.id === levelId)
    if (lvl?.hasIntro) {
      setScreen('level-intro')
    } else {
      setScreen('game')
    }
  }

  const handleIntroConfirm = (name: string) => {
    setCityName(name)
    setScreen('game')
  }

  const bounds = activeLevel?.mapBounds ?? FULL_BOUNDS

  return (
    <ConfigProvider
      theme={{ token: { colorPrimary: palette.ui.primary, borderRadius: 10, colorBgContainer: palette.ui.surface } }}
    >
      <AntdApp>
        <MessageBridge />
        <LoadingScreen visible={ready && screen === 'loading'} onEnter={handleMode} />
        {screen === 'level-select' && (
          <LevelSelect
            onStartLevel={handleStartLevel}
            onBack={() => setScreen('loading')}
          />
        )}
        {screen === 'level-intro' && (
          <LevelIntro onConfirm={handleIntroConfirm} />
        )}
        <input ref={fileInputRef} type="file" accept=".citysave,.json" style={{ display: 'none' }} />
        <LevelProvider level={activeLevel} cityName={cityName}>
          <SimulationProvider>
              <div className="app-root" style={{ opacity: screen === 'game' ? 1 : 0, transition: 'opacity 0.6s ease 0.1s', pointerEvents: screen === 'game' ? 'auto' : 'none' }}>
                <HUD />
                {showTutorial && <Tutorial onDismiss={() => setTutorialDone(true)} />}
                <Canvas shadows camera={{ position: [25, 25, 25], fov: 60, near: 0.01 }}>
                <MapScene />
                <ControlsBridge controlsRef={controlsRef} bounds={bounds} />
              </Canvas>
            </div>
          </SimulationProvider>
        </LevelProvider>
      </AntdApp>
    </ConfigProvider>
  )
}
