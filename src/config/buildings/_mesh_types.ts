import type React from 'react'

/**
 * Standard props passed to every building mesh component.
 *
 * dayTime  0–1 float coming from CityState.dayTime
 *          night zone: < 0.25 or > 0.75
 * baseY    pre-computed terrain Y offset (mountain snapping), supplied by
 *          MapScene so individual meshes don't need to import worldgen helpers.
 */
export interface BuildingMeshProps {
  x: number
  y: number
  /** Terrain height offset (0 for flat tiles, >0 on mountain tiles). */
  baseY: number
  /** Current occupant / worker count – used for window-light effects. */
  occupants: number
  /** 0–1 day-time fraction. Night = dayTime < 0.25 || dayTime > 0.75 */
  dayTime: number
}

export type BuildingMeshComponent = React.ComponentType<BuildingMeshProps>

