/**
 * Shared utilities for character/entity mesh components.
 */
import React from 'react'
import * as THREE from 'three'
import { isMountainAt, getMountainHeight } from '../../state/worldgen'
import worldGenConfig from '../../config/world-gen'
import { SIM_TICK_MS } from '../../config/simulation'

// ─── Terrain helpers ───────────────────────────────────────────────────────

export function tileH(x: number, y: number): number {
  return isMountainAt(x, y)
    ? 0.04 + getMountainHeight(x, y) * worldGenConfig.mountain.tileScale
    : 0
}

export function lerpTerrainY(sx: number, sz: number, tx: number, tz: number, t: number): number {
  const sh = tileH(Math.round(sx), Math.round(sz))
  const eh = tileH(Math.round(tx), Math.round(tz))
  return sh + (eh - sh) * t
}

// ─── Animation state hook ──────────────────────────────────────────────────
// Uses exponential decay (smooth=10/s) toward a 1-tick-ahead target.
// With AHEAD_S=0.1s, steady-state lag = speed/10 = speed*0.1 = exactly 1 tick distance,
// so the visual position matches the simulation exactly at every tick boundary.

export const SMOOTH = 10  // decay coefficient (1/s)

export function useCharacterAnim(x: number, y: number) {
  const ref = React.useRef<THREE.Group>(null)
  const animRef = React.useRef<{
    startX: number; startY: number
    targetX: number; targetY: number
    elapsedMs: number; tickDuration: number
    time: number; facing: number
    initialized: boolean
  }>({
    startX: x, startY: y,
    targetX: x, targetY: y,
    elapsedMs: 0, tickDuration: SIM_TICK_MS,
    time: 0, facing: 0,
    initialized: false,
  })

  React.useEffect(() => {
    const a = animRef.current
    if (!a.initialized) {
      a.startX = x; a.startY = y
      a.targetX = x; a.targetY = y
      a.elapsedMs = 0; a.tickDuration = SIM_TICK_MS
      a.initialized = true
      if (ref.current) ref.current.position.set(x, 0, y)
      return
    }
    // Capture current interpolated position as new start
    const curT = Math.min(1, a.elapsedMs / a.tickDuration)
    a.startX = a.startX + (a.targetX - a.startX) * curT
    a.startY = a.startY + (a.targetY - a.startY) * curT
    a.targetX = x
    a.targetY = y
    a.elapsedMs = 0
    a.tickDuration = SIM_TICK_MS
  }, [x, y])

  return { ref, animRef }
}
