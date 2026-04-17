/**
 * Engine factory — creates a JobEngineAPI backed by the live TickContext.
 *
 * Import rules:
 *  - This file MAY import from state/routines/types, state/helpers, state/types.
 *  - Config-layer job behaviors must NEVER import this file directly;
 *    they receive the API via dependency injection from jobDispatchRoutine.
 */
import type { TickContext } from '../routines/types'
import type { JobEngineAPI, AreaEffectField, SpawnWalkerParams, WalkerPurpose } from './types'
import { isRoadAt } from '../helpers'

export function createJobEngine(ctx: TickContext): JobEngineAPI {
  return {
    // ── Tick metadata ─────────────────────────────────────────────────────────
    get nextTick()       { return ctx.nextTick },
    get isNewDay()       { return ctx.isNewDay },
    get crossedMorning() { return ctx.crossedMorning },
    get isDaytime()      { return ctx.isDaytime },

    // ── Spatial queries ───────────────────────────────────────────────────────
    getRoadsAdjacentTo(x, y) {
      return ([ [1, 0], [-1, 0], [0, 1], [0, -1] ] as [number, number][])
        .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
        .filter(t => isRoadAt(ctx.s.roads, t.x, t.y))
    },

    getWalkerPositions(purpose: WalkerPurpose) {
      // Walkers are now citizen.motion — filter citizens by motion.purpose
      return ctx.citizens
        .filter(c => c.motion?.purpose === purpose)
        .map(c => {
          const m = c.motion!
          return { ...(m.route[m.routeIndex] ?? m.route[0] ?? { x: 0, y: 0 }) }
        })
    },

    // ── World mutations ───────────────────────────────────────────────────────
    spawnWalker(params: SpawnWalkerParams) {
      // Patrol walkers have no real citizen — attach motion to the citizen if they exist
      ctx.citizens = ctx.citizens.map(c =>
        c.id === params.citizenId
          ? { ...c, motion: {
              route:      params.route.map(p => ({ x: p.x, y: p.y })),
              routeIndex: 0,
              routeT:     0,
              speed:      params.speed,
              purpose:    params.purpose,
              stepsLeft:  params.stepsLeft,
            }}
          : c,
      )
    },

    decayAreaEffect(field: AreaEffectField, factor: number) {
      if (field === 'houseSafety') {
        ctx.buildings = ctx.buildings.map(b => {
          if (!b.residentData) return b
          const next = b.residentData.safety * factor
          if (next < 0.001) return { ...b, residentData: { ...b.residentData, safety: 0 } }
          return { ...b, residentData: { ...b.residentData, safety: next } }
        })
      }
    },

    boostAreaEffect(field: AreaEffectField, origin, radius, boost) {
      if (field === 'houseSafety') {
        ctx.buildings = ctx.buildings.map(b => {
          if (!b.residentData || (b.type !== 'house' && (b.type as string) !== 'manor')) return b
          const dist = Math.max(Math.abs(b.x - origin.x), Math.abs(b.y - origin.y))
          if (dist > radius) return b
          const cur = b.residentData.safety
          return { ...b, residentData: { ...b.residentData, safety: Math.min(1.0, cur + boost * (1 - dist / (radius + 1))) } }
        })
      }
    },
  }
}

