/**
 * Shared utilities for character/entity mesh components.
 * - useCharacterAnim  animation state hook (position lerp + facing)
 * - tileH             visual terrain height for a tile
 * - lerpTerrainY      interpolated terrain Y along a character's path
 */
import React from 'react'
import * as THREE from 'three'
import { SIM_TICK_MS } from '../../config/simulation'
import { isMountainAt, getMountainHeight } from '../../state/worldgen'
import worldGenConfig from '../../config/world-gen'

// ─── Terrain helpers ───────────────────────────────────────────────────────

export function tileH(x: number, y: number): number {
  return 0.04 + getMountainHeight(x, y) * worldGenConfig.mountain.tileScale
}

export function lerpTerrainY(sx: number, sz: number, tx: number, tz: number, t: number): number {
  const sh = isMountainAt(Math.round(sx), Math.round(sz)) ? tileH(Math.round(sx), Math.round(sz)) : 0
  const eh = isMountainAt(Math.round(tx), Math.round(tz)) ? tileH(Math.round(tx), Math.round(tz)) : 0
  return sh + (eh - sh) * t
}

// ─── Animation state hook ──────────────────────────────────────────────────

export function useCharacterAnim(x: number, y: number) {
  const ref = React.useRef<THREE.Group>(null)
  const animRef = React.useRef({
    startX: x, startY: y, targetX: x, targetY: y,
    elapsedMs: SIM_TICK_MS, initialized: false,
    time: 0, facing: 0,
  })
  React.useEffect(() => {
    const a = animRef.current
    if (!a.initialized) {
      a.startX = x; a.startY = y; a.targetX = x; a.targetY = y
      a.elapsedMs = SIM_TICK_MS; a.initialized = true
      if (ref.current) ref.current.position.set(x, 0, y)
      return
    }
    a.startX = ref.current?.position.x ?? a.targetX
    a.startY = ref.current?.position.z ?? a.targetY
    a.targetX = x; a.targetY = y; a.elapsedMs = 0
  }, [x, y])
  return { ref, animRef }
}

