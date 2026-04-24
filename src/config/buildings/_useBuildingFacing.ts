/**
 * useBuildingFacing — shared hook that computes the Y-axis rotation (radians)
 * needed to orient a building's "front face" toward the nearest road.
 *
 * Convention (same as HouseMesh):
 *   0          → south  (+z)  → road at y+h
 *   Math.PI    → north  (-z)  → road at y-1
 *   Math.PI/2  → east   (+x)  → road at x+w
 *  -Math.PI/2  → west   (-x)  → road at x-1
 *
 * For multi-tile buildings the check scans the ENTIRE edge so a road touching
 * any tile on that edge counts.
 */
import React from 'react'
import { useSimulation } from '../../state/simulation'

export function useBuildingFacing(x: number, y: number, w = 1, h = 1): number {
  const { state } = useSimulation()
  return React.useMemo(() => {
    const roads = state.roads
    const has = (rx: number, ry: number) => roads.some(t => t.x === rx && t.y === ry)

    // Check each full edge
    // South edge: row y+h, columns x .. x+w-1
    const hasSouth = Array.from({ length: w }, (_, i) => has(x + i, y + h)).some(Boolean)
    // North edge: row y-1, columns x .. x+w-1
    const hasNorth = Array.from({ length: w }, (_, i) => has(x + i, y - 1)).some(Boolean)
    // East edge: col x+w, rows y .. y+h-1
    const hasEast  = Array.from({ length: h }, (_, j) => has(x + w, y + j)).some(Boolean)
    // West edge: col x-1, rows y .. y+h-1
    const hasWest  = Array.from({ length: h }, (_, j) => has(x - 1, y + j)).some(Boolean)

    if (hasSouth) return 0
    if (hasNorth) return Math.PI
    if (hasEast)  return  Math.PI / 2
    if (hasWest)  return -Math.PI / 2
    return 0
  }, [state.roads, x, y, w, h])
}

