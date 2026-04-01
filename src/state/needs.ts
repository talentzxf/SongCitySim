/**
 * 需求层次系统（Maslow 式，宋代城市情境）
 *
 * 层级越低，未满足的即时惩罚越重；
 * 同一需求长期未满足（超过 chronicThresholdDays）时触发慢性惩罚叠加，
 * 满意度下降速度随时间加剧，直至需求得到改善。
 */
import type { CitizenStatus, NeedCheck, NeedId, NeedContext, CropInventory } from './types'
import { DAY_TICKS } from '../config/simulation'

// ── 每 tick 的 satisfaction 基础变化量（0-100）──────────────────────────────
export const SAT_DELTA: Record<CitizenStatus, number> = {
  working:   +0.055,
  farming:   +0.045,
  shopping:  +0.050,
  returning: +0.035,
  commuting: +0.008,
  idle:      -0.028,
  sick:      -0.065,
}

// 无聊惩罚：同一状态持续超过阈值后，每 tick 额外扣分
export const BOREDOM: Partial<Record<CitizenStatus, { threshold: number; extra: number }>> = {
  working:   { threshold: 200, extra: 0.028 },
  farming:   { threshold: 210, extra: 0.018 },
  commuting: { threshold:  65, extra: 0.052 },
}

// ── 需求层次（从低到高） ─────────────────────────────────────────────────────
export const CITIZEN_NEEDS: NeedCheck[] = [
  // T1 生存
  { id: 'food_basic',    tier: 1, labelCn: '温饱',    deltaIfMet: 0,     deltaIfUnmet: -0.150, chronicThresholdDays:  3 },
  // T2 安居
  { id: 'food_adequate', tier: 2, labelCn: '粮食充足', deltaIfMet: 0.005, deltaIfUnmet: -0.060, chronicThresholdDays:  7 },
  { id: 'shelter',       tier: 2, labelCn: '道路通达', deltaIfMet: 0.004, deltaIfUnmet: -0.040, chronicThresholdDays: 10 },
  // T3 温饱有余
  { id: 'employment',    tier: 3, labelCn: '有业可从', deltaIfMet: 0.006, deltaIfUnmet: -0.035, chronicThresholdDays: 14 },
  { id: 'food_variety',  tier: 3, labelCn: '饮食多样', deltaIfMet: 0.008, deltaIfUnmet: -0.025, chronicThresholdDays: 14 },
  { id: 'savings',       tier: 3, labelCn: '积蓄盈余', deltaIfMet: 0.003, deltaIfUnmet: -0.015, chronicThresholdDays: 21 },
  // T4 丰盛
  { id: 'food_rich',     tier: 4, labelCn: '食多味美', deltaIfMet: 0.010, deltaIfUnmet: -0.012, chronicThresholdDays: 21 },
  { id: 'market_access', tier: 4, labelCn: '市场便利', deltaIfMet: 0.006, deltaIfUnmet: -0.010, chronicThresholdDays: 21 },
  // T5 文化
  { id: 'education',     tier: 5, labelCn: '文教兴旺', deltaIfMet: 0.012, deltaIfUnmet: -0.006, chronicThresholdDays: 30 },
  { id: 'entertainment', tier: 5, labelCn: '娱乐休闲', deltaIfMet: 0.010, deltaIfUnmet: -0.005, chronicThresholdDays: 30 },
]

// ── 单项需求判定 ──────────────────────────────────────────────────────────────
export function checkNeed(need: NeedCheck, ctx: NeedContext): boolean {
  switch (need.id) {
    case 'food_basic':     return ctx.food >= 2
    case 'food_adequate':  return ctx.food >= 8
    case 'shelter':        return ctx.hasRoad
    case 'employment':     return ctx.hasJob
    case 'food_variety':   return ctx.dietVariety >= 2
    case 'savings':        return ctx.savings >= 20
    case 'food_rich':      return ctx.dietVariety >= 3
    case 'market_access':  return ctx.nearMarket
    case 'education':      return ctx.nearAcademy
    case 'entertainment':  return ctx.nearEntertainment
  }
}

/**
 * 更新各需求的连续未满足帧数，同时计算本 tick 需求层次贡献的满意度 delta。
 *
 * 慢性惩罚：某需求连续未满足超过 chronicThresholdDays 天后，
 * 在基础 deltaIfUnmet 之上额外叠加最多 50% 的追加惩罚（线性增至阈值的 1× 处）。
 * 需求一旦满足，对应 unmetTicks 归零，慢性惩罚立即停止。
 */
export function updateNeedsAndDelta(
  prevUnmetTicks: Partial<Record<NeedId, number>>,
  ctx: NeedContext,
): { updatedUnmetTicks: Partial<Record<NeedId, number>>; satDelta: number } {
  const updated: Partial<Record<NeedId, number>> = { ...prevUnmetTicks }
  let satDelta = 0

  for (const need of CITIZEN_NEEDS) {
    const met = checkNeed(need, ctx)

    if (met) {
      updated[need.id] = 0
      satDelta += need.deltaIfMet
    } else {
      const prevTicks = prevUnmetTicks[need.id] ?? 0
      const newTicks  = prevTicks + 1
      updated[need.id] = newTicks

      satDelta += need.deltaIfUnmet

      // 慢性惩罚叠加（超出阈值天数后线性加重，上限 0.5× deltaIfUnmet）
      const daysUnmet = newTicks / DAY_TICKS
      const thresh    = need.chronicThresholdDays
      if (daysUnmet > thresh) {
        const extraFrac = Math.min(1, (daysUnmet - thresh) / thresh)
        satDelta += need.deltaIfUnmet * extraFrac * 0.5
      }
    }
  }

  return { updatedUnmetTicks: updated, satDelta }
}

// ── 独立构建需求上下文（HUD 面板等场合调用） ─────────────────────────────────
export function buildNeedContext(
  houseId: string,
  house: { x: number; y: number },
  roads: { x: number; y: number }[],
  houseFood: Record<string, number>,
  houseCrops: Record<string, CropInventory>,
  houseSavings: Record<string, number>,
  buildings: { type: string; x: number; y: number }[],
): NeedContext {
  const CROP_K = ['rice', 'millet', 'wheat', 'soybean', 'vegetable'] as const
  const food    = houseFood[houseId] ?? 0
  const hasRoad = roads.some(r =>
    (Math.abs(r.x - house.x) === 1 && r.y === house.y) ||
    (Math.abs(r.y - house.y) === 1 && r.x === house.x))
  const hc           = houseCrops[houseId]
  const dietVariety  = hc ? CROP_K.filter(k => hc[k] > 0.1).length : 0
  const savings      = houseSavings[houseId] ?? 0
  const cheb = (bx: number, by: number) => Math.max(Math.abs(bx - house.x), Math.abs(by - house.y))
  const nearMarket        = buildings.some(b => b.type === 'market'   && cheb(b.x, b.y) <= 10)
  const nearAcademy       = buildings.some(b => (b.type as string) === 'academy'  && cheb(b.x, b.y) <=  8)
  const nearEntertainment = buildings.some(b =>
    ((b.type as string) === 'tavern' || (b.type as string) === 'teahouse') && cheb(b.x, b.y) <= 8)
  return { food, hasRoad, dietVariety, hasJob: false, savings, nearMarket, nearAcademy, nearEntertainment }
}

