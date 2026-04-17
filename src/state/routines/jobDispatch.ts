/**
 * Job Dispatch Routine
 * ─────────────────────────────────────────────────────────────────────────────
 * Each tick this routine:
 *  1. Calls onGlobalTick() once per registered job behavior (global effects
 *     such as area-field decay and walker-position-based boosts).
 *  2. For every placed building, resolves its job slots from the building
 *     config, builds a WorkplaceInfo (including live workers), then calls
 *     onWorkplaceTick() on each matching job behavior.
 *
 * Engine / Config isolation is enforced:
 *  - Job behaviors receive only JobEngineAPI + WorkplaceInfo (engine-defined
 *    interfaces). They never see TickContext or Walker[].
 *  - createJobEngine() wraps ctx and exposes only the sanctioned API surface.
 */
import type { TickRoutine } from './types'
import type { WorkplaceInfo, WorkerInfo } from '../engine/types'
import { createJobEngine } from '../engine'
import { JOB_BEHAVIOR_REGISTRY } from '../../config/jobs/_behavior_loader'
import { BUILDING_REGISTRY } from '../../config/buildings/_loader'

export const jobDispatchRoutine: TickRoutine = (ctx) => {
  const engine = createJobEngine(ctx)

  // ── 1. Global tick hooks — called once per job type ──────────────────────
  for (const behavior of Object.values(JOB_BEHAVIOR_REGISTRY)) {
    behavior.onGlobalTick?.(engine)
  }

  // ── 2. Per-workplace tick hooks ──────────────────────────────────────────
  for (const building of ctx.s.buildings) {
    const buildingCfg = BUILDING_REGISTRY[building.type]
    if (!buildingCfg?.jobs?.length) continue

    // Build worker list once per building (shared across job slots of same building)
    const workerInfos: WorkerInfo[] = ctx.citizens
      .filter(c => c.workplaceId === building.id)
      .map(c => ({ id: c.id, isAtHome: c.isAtHome, isSick: c.isSick }))

    const workplace: WorkplaceInfo = {
      id:      building.id,
      x:       building.x,
      y:       building.y,
      type:    building.type,
      workers: workerInfos,
    }

    for (const jobSlot of buildingCfg.jobs) {
      const behavior = JOB_BEHAVIOR_REGISTRY[jobSlot.jobId]
      behavior?.onWorkplaceTick?.(engine, workplace)
    }
  }

  return ctx
}

