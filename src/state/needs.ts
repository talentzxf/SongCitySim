/**
 * 需求层次系统（Maslow 式，宋代城市情境）
 *
 * 层级越低，未满足的即时惩罚越重；
 * 同一需求长期未满足（超过 chronicThresholdDays）时触发慢性惩罚叠加，
 * 满意度下降速度随时间加剧，直至需求得到改善。
 */
import type { CitizenStatus, NeedCheck, NeedId, NeedContext, CropInventory } from './types'
import { DAY_TICKS } from '../config/simulation'
import { CROP_KEYS } from './helpers'

// ── 每 tick 的 satisfaction 基础变化量（0-100）──────────────────────────────
export const SAT_DELTA: Record<CitizenStatus, number> = {
  working:   +0.042,
  farming:   +0.035,
  shopping:  +0.045,
  returning: +0.030,
  commuting: +0.006,
  idle:      -0.032,
  sick:      -0.065,
}

// 无聊惩罚：同一状态持续超过阈值后，每 tick 额外扣分
export const BOREDOM: Partial<Record<CitizenStatus, { threshold: number; extra: number }>> = {
  working:   { threshold: 200, extra: 0.030 },
  farming:   { threshold: 210, extra: 0.022 },
  commuting: { threshold:  65, extra: 0.052 },
  idle:      { threshold: 120, extra: 0.018 }, // 长期闲居会越来越无聊
}

// ── 需求层次（从低到高） ─────────────────────────────────────────────────────
export const CITIZEN_NEEDS: NeedCheck[] = [
  // T1 生存
  { id: 'food_basic',    tier: 1, labelCn: '温饱',    deltaIfMet: 0,     deltaIfUnmet: -0.150, chronicThresholdDays:  3 },
  // T2 安居
  { id: 'food_adequate', tier: 2, labelCn: '粮食充足', deltaIfMet: 0.004, deltaIfUnmet: -0.060, chronicThresholdDays:  7 },
  { id: 'shelter',       tier: 2, labelCn: '道路通达', deltaIfMet: 0.003, deltaIfUnmet: -0.040, chronicThresholdDays: 10 },
  // T3 温饱有余
  { id: 'employment',    tier: 3, labelCn: '有业可从', deltaIfMet: 0.005, deltaIfUnmet: -0.035, chronicThresholdDays: 14 },
  { id: 'food_variety',  tier: 3, labelCn: '饮食多样', deltaIfMet: 0.007, deltaIfUnmet: -0.025, chronicThresholdDays: 14 },
  { id: 'savings',       tier: 3, labelCn: '积蓄盈余', deltaIfMet: 0.003, deltaIfUnmet: -0.015, chronicThresholdDays: 21 },
  // T4 丰盛
  { id: 'food_rich',     tier: 4, labelCn: '食多味美', deltaIfMet: 0.008, deltaIfUnmet: -0.012, chronicThresholdDays: 21 },
  { id: 'market_access', tier: 4, labelCn: '市场便利', deltaIfMet: 0.005, deltaIfUnmet: -0.010, chronicThresholdDays: 21 },
  // T5 文化
  { id: 'education',     tier: 5, labelCn: '文教兴旺', deltaIfMet: 0.010, deltaIfUnmet: -0.008, chronicThresholdDays: 30 },
  { id: 'entertainment', tier: 5, labelCn: '娱乐休闲', deltaIfMet: 0.009, deltaIfUnmet: -0.007, chronicThresholdDays: 30 },
  // T6 享乐（所有居民，需玩家建设更多设施）
  { id: 'festive_life',  tier: 6, labelCn: '节庆热闹', deltaIfMet: 0.012, deltaIfUnmet: -0.010, chronicThresholdDays: 30 },
  { id: 'refined_goods', tier: 6, labelCn: '书香雅物', deltaIfMet: 0.010, deltaIfUnmet: -0.008, chronicThresholdDays: 30 },
  // T7 贵族专属（仅宅邸贵族，isGentry=true）
  { id: 'personal_service', tier: 7, labelCn: '侍从服务', deltaIfMet: 0.015, deltaIfUnmet: -0.020, chronicThresholdDays: 20 },
  { id: 'luxury_feast',     tier: 7, labelCn: '精馔佳肴', deltaIfMet: 0.015, deltaIfUnmet: -0.018, chronicThresholdDays: 20 },
]

// ── 单项需求判定 ──────────────────────────────────────────────────────────────
export function checkNeed(need: NeedCheck, ctx: NeedContext): boolean {
  switch (need.id) {
    case 'food_basic':        return ctx.food >= 2
    case 'food_adequate':     return ctx.food >= 8
    case 'shelter':           return ctx.hasRoad
    case 'employment':        return ctx.hasJob
    case 'food_variety':      return ctx.dietVariety >= 2
    case 'savings':           return ctx.savings >= 20
    case 'food_rich':         return ctx.dietVariety >= 3
    case 'market_access':     return ctx.nearMarket
    case 'education':         return ctx.dietVariety >= 2 ? ctx.nearAcademy : true
    case 'entertainment':     return ctx.nearEntertainment
    // T6 — 所有居民都有，但需要玩家建更多设施
    case 'festive_life':      return ctx.nearEntertainment && ctx.nearTemple
    case 'refined_goods':     return ctx.nearCulturalVenue
    // T7 — 仅宅邸贵族（isGentry=true）
    case 'personal_service':  return ctx.isGentry && ctx.manorServantCount >= 2
    case 'luxury_feast':      return ctx.isGentry && ctx.food >= 20 && ctx.hasTea && ctx.dietVariety >= 4
  }
}

/**
 * 更新各需求的连续未满足帧数，同时计算本 tick 需求层次贡献的满意度 delta。
 *
 * 慢性惩罚：某需求连续未满足超过 chronicThresholdDays 天后，
 * 在基础 deltaIfUnmet 之上额外叠加最多 50% 的追加惩罚（线性增至阈值的 1× 处）。
 * 需求一旦满足，对应 unmetTicks 归零，慢性惩罚立即停止。
 *
 * T7 需求（personal_service / luxury_feast）只对 isGentry=true 的市民生效；
 * 非贵族视为自动满足（不扣分也不加分）。
 */
export function updateNeedsAndDelta(
  prevUnmetTicks: Partial<Record<NeedId, number>>,
  ctx: NeedContext,
): { updatedUnmetTicks: Partial<Record<NeedId, number>>; satDelta: number } {
  const updated: Partial<Record<NeedId, number>> = { ...prevUnmetTicks }
  let satDelta = 0

  for (const need of CITIZEN_NEEDS) {
    // T7 需求：非贵族自动跳过（既不加分也不扣分）
    if (need.tier === 7 && !ctx.isGentry) {
      updated[need.id] = 0
      continue
    }

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
  const food    = houseFood[houseId] ?? 0
  const hasRoad = roads.some(r =>
    (Math.abs(r.x - house.x) === 1 && r.y === house.y) ||
    (Math.abs(r.y - house.y) === 1 && r.x === house.x))
  const hc           = houseCrops[houseId]
  const dietVariety  = hc ? CROP_KEYS.filter(k => hc[k] > 0.1).length : 0
  const hasTea       = hc ? (hc['tea' as keyof typeof hc] ?? 0) > 0.1 : false
  const savings      = houseSavings[houseId] ?? 0
  const cheb = (bx: number, by: number) => Math.max(Math.abs(bx - house.x), Math.abs(by - house.y))
  const nearMarket        = buildings.some(b => b.type === 'market'   && cheb(b.x, b.y) <= 10)
  const nearAcademy       = dietVariety >= 2 && buildings.some(b => (b.type as string) === 'academy'  && cheb(b.x, b.y) <= 15)
  const nearEntertainment = buildings.some(b =>
    ((b.type as string) === 'tavern' || (b.type as string) === 'teahouse') && cheb(b.x, b.y) <= 8)
  const nearTemple        = buildings.some(b => (b.type as string) === 'temple'    && cheb(b.x, b.y) <= 12)
  const nearCulturalVenue = buildings.some(b =>
    ((b.type as string) === 'academy' || (b.type as string) === 'papermill') && cheb(b.x, b.y) <= 15)
  return {
    food, hasRoad, dietVariety, hasJob: false, savings,
    nearMarket, nearAcademy, nearEntertainment,
    nearTemple, nearCulturalVenue,
    isGentry: false, manorServantCount: 0, hasTea,
  }
}

