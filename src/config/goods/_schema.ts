/**
 * TypeScript schema for goods / product metadata.
 * Each good lives in its own folder: src/config/goods/{id}/config.json
 */

export type GoodsCategory =
  | 'crop'           // 粮食作物：稻米、粟米、麦子等
  | 'iron_tool'      // 铁制农具：曲辕犁、铁锄等
  | 'weapon'         // 武器：刀剑、长矛等
  | 'raw_material'   // 原材料：铁矿石、木材等
  | 'processed'      // 加工品：豆腐、布匹等
  | 'luxury'         // 奢侈品：丝绸、瓷器等
  | 'medicine'       // 药材/成药
  | 'cultural_item'  // 文化用品：书籍、乐器等
  | 'livestock'      // 牲畜/畜产品

export type GoodsFunction =
  | 'food'       // 满足饮食需求
  | 'tool'       // 提升生产效率
  | 'weapon'     // 军事/防御
  | 'material'   // 作为其他产品的原材料
  | 'culture'    // 满足文化需求
  | 'medicine'   // 满足健康需求
  | 'luxury'     // 满足奢侈/娱乐需求
  | 'transport'  // 运输/物流辅助

/** Effect applied when this good is present, consumed, or used. */
export type GoodsEffect =
  | { type: 'satisfy_need'; needId: string; amount: number }
  | { type: 'production_boost'; targetGoodId: string; multiplier: number }
  | { type: 'stat_boost'; stat: 'food' | 'safety' | 'culture' | 'satisfaction'; amount: number }

/** Extra data only relevant for farmable crops. */
export type CropData = {
  fertilityWeight: number
  growthSeasons: ('spring' | 'summer' | 'autumn' | 'winter')[]
  waterRequirement: 'none' | 'low' | 'medium' | 'high'
  terrainPreference: string[]
}

/** Extra data only relevant for iron tools. */
export type ToolData = {
  efficiencyBonus: number
  durabilityMax: number
  wearPerDay: number
  durabilityLowThreshold: number
}

export type GoodsRenderAssets = {
  sprite?: string
  iconSvg?: string
}

/**
 * Full metadata for a single tradeable good or product.
 * Config lives in:  goods/{id}/config.json
 */
export type GoodsConfig = {
  id: string
  label: string
  labelEn: string
  category: GoodsCategory
  subCategory?: string
  price: number
  unit: string
  unitEn: string
  storageSlots: number
  stackSize: number
  function: GoodsFunction
  effects: GoodsEffect[]
  cropData?: CropData
  toolData?: ToolData
  producedBy: string[]
  storedIn: string[]
  consumedBy: string[]
  tradeable: boolean
  perishable: boolean
  perishDays?: number
  desc: string
  icon: string
  renderAssets?: GoodsRenderAssets
}

