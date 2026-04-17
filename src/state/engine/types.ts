/**
 * Engine API — the contract between job behaviors (config layer) and the
 * simulation engine (state layer).
 *
 * Job behaviors MUST only depend on the types in this file.
 * They must NEVER import from:
 *   - src/state/routines/*  (TickContext or TickRoutine)
 *   - src/state/helpers.*   (state mutation utilities)
 *   - src/state/types.*     (internal simulation entity types)
 *
 * All simulation side-effects must be achieved by calling JobEngineAPI.
 */
import type { WalkerPurpose } from '../types'

// Re-export so behavior files can import WalkerPurpose from this file
// without having to reach into state/types directly.
export type { WalkerPurpose }

// ── Shared primitives ─────────────────────────────────────────────────────────

/** Named area-effect fields that job behaviors can operate on. */
export type AreaEffectField = 'houseSafety'


// ── Data interfaces (engine-defined, no state/types import needed) ─────────────

/**
 * Minimal citizen info visible to a job behavior.
 * Deliberately narrow: behaviors should not need full Citizen details.
 */
export interface WorkerInfo {
  readonly id: string
  readonly isAtHome: boolean
  readonly isSick: boolean
}

/**
 * Minimal building info visible to a job behavior.
 * `workers` contains all citizens currently assigned to this workplace
 * (including sick / away ones — behaviors filter as needed).
 */
export interface WorkplaceInfo {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly type: string
  readonly workers: ReadonlyArray<WorkerInfo>
}

/** Parameters required to spawn a new walker via the engine. */
export interface SpawnWalkerParams {
  readonly id: string
  readonly citizenId: string
  readonly route: ReadonlyArray<{ x: number; y: number }>
  readonly speed: number
  readonly purpose: WalkerPurpose
  readonly stepsLeft?: number
}

// ── Engine API surface ────────────────────────────────────────────────────────

/**
 * The only interface job behaviors are allowed to call.
 * Implemented by createJobEngine() in src/state/engine/index.ts.
 */
export interface JobEngineAPI {
  // ── Tick metadata (read-only) ─────────────────────────────────────────────
  readonly nextTick: number
  readonly isNewDay: boolean
  readonly crossedMorning: boolean
  readonly isDaytime: boolean

  // ── Spatial queries ───────────────────────────────────────────────────────

  /** Returns road-tile coordinates that are directly adjacent (4-directional) to (x, y). */
  getRoadsAdjacentTo(x: number, y: number): ReadonlyArray<{ x: number; y: number }>

  /**
   * Returns the current grid position (route waypoint) of every active walker
   * whose purpose matches the given string.
   */
  getWalkerPositions(purpose: WalkerPurpose): ReadonlyArray<{ x: number; y: number }>

  // ── World mutations ───────────────────────────────────────────────────────

  /** Appends a new walker to the simulation world. */
  spawnWalker(params: SpawnWalkerParams): void

  /**
   * Multiplies every entry in the named area-effect field by `factor`.
   * Entries that fall below 0.001 are pruned to keep the map lean.
   */
  decayAreaEffect(field: AreaEffectField, factor: number): void

  /**
   * Adds a Chebyshev-distance-weighted boost to every residential building
   * within `radius` tiles of `origin` in the named area-effect field.
   * Values are clamped to [0, 1].
   */
  boostAreaEffect(
    field: AreaEffectField,
    origin: { x: number; y: number },
    radius: number,
    boost: number,
  ): void
}

// ── Job behavior contract ─────────────────────────────────────────────────────

/**
 * A job behavior module.
 * Lives at:  src/config/jobs/{jobId}/behavior.ts
 * Must export a named constant:  export const behavior: JobBehavior = { ... }
 *
 * Design rules:
 *  - Only import from src/state/engine/types  (this file).
 *  - All simulation effects must go through JobEngineAPI callbacks.
 *  - No direct access to TickContext, Walker[], or any mutable state.
 */
export type JobBehavior = {
  /**
   * Called ONCE per tick, before any per-workplace calls.
   * Use for global field effects:
   *   e.g. safety decay, ambient boosts derived from active walkers.
   */
  onGlobalTick?: (engine: JobEngineAPI) => void

  /**
   * Called ONCE per tick for every building instance that has this job assigned.
   * `workplace.workers` contains all citizens assigned here (filter as needed).
   */
  onWorkplaceTick?: (engine: JobEngineAPI, workplace: WorkplaceInfo) => void
}

