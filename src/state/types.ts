// ─── Building types (宋朝) ─────────────────────────────────────────────────
export type BuildingType =
  | 'house'        // 院落（民居）
  | 'manor'        // 宅邸（园林大院，豪华民居）
  | 'market'       // 草市
  | 'granary'      // 常平仓
  | 'blacksmith'   // 铁作坊
  | 'mine'         // 铁矿坑
  | 'academy'      // 书院
  | 'papermill'    // 造纸坊
  | 'lumbercamp'   // 采木场
  | 'watchpost'    // 巡检司（治安）
  | 'farmZone'     // 粮田（2×2，近水平地）
  | 'teaZone'      // 茶园（2×2，山地梯田）

export const ALL_BUILDING_TYPES: BuildingType[] = [
  'house', 'manor', 'market', 'granary', 'blacksmith', 'mine', 'academy', 'papermill', 'lumbercamp',
  'watchpost', 'farmZone', 'teaZone',
]

export type Profession =
  | 'merchant'    // 商贩（集市 / 茶坊）
  | 'smith'       // 铁匠（铁匠铺）
  | 'miner'       // 矿工（冶铁厂）
  | 'storekeeper' // 仓丁（粮仓）
  | 'farmer'      // 农夫（农田）
  | 'innkeeper'   // 掌柜（酒肆）
  | 'monk'        // 僧人（寺庙）
  | 'scholar'     // 学子（书院）
  | 'herbalist'   // 郎中（药铺）
  | 'logger'      // 伐木工（采木场）
  | 'papermaker'  // 造纸工（造纸坊）
  | 'servant'     // 丫鬟/仆役（宅邸服侍）
  | 'steward'     // 管家（宅邸管理）
  | 'patroller'   // 弓手（巡检司）

export type CropType = 'rice' | 'millet' | 'wheat' | 'soybean' | 'vegetable' | 'tea'
export type CropInventory = Record<CropType, number>

/** 农地种类（宋制）：粮田（近水旱地）| 茶园（山地梯田）*/
export type FarmZoneType = 'grain' | 'tea'

/** 田间收获堆（等待牛车来取） */
export type FarmPile = {
  id: string; zoneId: string
  x: number; y: number
  cropType: CropType; amount: number
  age: number
}

/** FarmZone owns its own harvest piles. */
export type FarmZone = {
  id: string; x: number; y: number
  zoneType: FarmZoneType
  cropType: CropType
  pendingCropType?: CropType
  growthProgress: number
  /** Harvest piles waiting for ox-cart collection (was farmPiles[] on CityState). */
  piles: FarmPile[]
}

export type RiverTile = { x: number; y: number }

export type Gender = 'male' | 'female'

// ─── Building sub-state ──────────────────────────────────────────────────────

/**
 * Residential ledger — owned by house / manor buildings.
 * Replaces the scattered houseFood / houseCrops / houseSavings /
 * houseTools / houseDead / houseSafety Records on CityState.
 */
export type ResidentData = {
  food: number              // total food (sum of crops), cached for quick need checks
  crops: CropInventory      // per-crop storage
  savings: number           // household savings (文)
  tools: number             // farming-tool durability (0-100)
  safety: number            // patrol coverage (0-1, decays naturally)
  dead: number              // cumulative death count
}

/**
 * Production / storage inventory — owned by granary, market, mine,
 * blacksmith, lumbercamp buildings.
 * Replaces granaryInventory / marketInventory / mineInventory /
 * smithInventory / timberInventory on CityState.
 */
export type BuildingInventory = {
  crops: CropInventory  // granary & market crop stores
  ironOre: number       // mine ore stockpile
  ironTools: number     // blacksmith finished-tool stockpile
  timber: number        // lumbercamp timber stockpile
}

/**
 * Logistics agent dispatched by a building (ox-cart or wholesale market buyer).
 * Replaces the OxCart and MarketBuyer types + their CityState arrays.
 */
export type AgentKind = 'oxcart' | 'marketbuyer'

export type BuildingAgent = {
  id: string
  kind: AgentKind
  route: { x: number; y: number }[]
  routeIndex: number; routeT: number; speed: number
  pickedUp: boolean
  cargoType: CropType; cargoAmount: number
  // oxcart only
  pileId?: string
  granaryId?: string
  pileWaypointIndex?: number
  // marketbuyer only
  srcGranaryId?: string
}

export type MarketConfig = { shopkeepers: number; peddlers: number }

/** Stats recorded for a single peddler round-trip. */
export type PeddlerTripStat = {
  peddlerId:    string
  citizenId?:   string
  dayCount:     number
  cargoAtStart: number
  housesServed: number
  foodSold:     number
  revenue:      number
  toolsSold:    number
}

/** Building is now self-contained: it owns all its mutable sub-state. */
export type Building = {
  id: string
  type: BuildingType
  x: number; y: number
  w: number; h: number
  level: number
  capacity: number
  occupants: number
  workerSlots: number
  cost: number
  /** Residential ledger (house / manor only). */
  residentData?: ResidentData
  /** Production/storage inventory (granary / market / mine / blacksmith / lumbercamp). */
  inventory?: BuildingInventory
  /** Market dispatch config (market only). */
  marketConfig?: MarketConfig
  /** Active logistics agents: ox-carts (granary) and wholesale buyers (market). */
  agents: BuildingAgent[]
  /** Market peddler trip log — last N completed round-trips (market only). */
  tripLog?: PeddlerTripStat[]
}

export type CitizenNeeds = { food: number; safety: number; culture: number }

// 市民行为状态机 ─────────────────────────────────────────────────────────────
export type CitizenStatus =
  | 'idle'       // 在家闲居
  | 'commuting'  // 通勤途中
  | 'working'    // 在工坊劳作
  | 'farming'    // 在农田耕种
  | 'shopping'   // 在集市采购
  | 'returning'  // 购完带货回家
  | 'sick'       // 患病

// ─── 需求层次（Maslow 式，宋代城市情境）──────────────────────────────────────
export type NeedId =
  | 'food_basic'       // T1 温饱：food ≥ 2
  | 'food_adequate'    // T2 粮足：food ≥ 8
  | 'shelter'          // T2 道路通达
  | 'employment'       // T3 有业可从
  | 'food_variety'     // T3 饮食多样
  | 'savings'          // T3 积蓄盈余
  | 'food_rich'        // T4 食多味美
  | 'market_access'    // T4 市场便利
  | 'education'        // T5 文教兴旺
  | 'entertainment'    // T5 娱乐休闲
  | 'festive_life'     // T6 节庆热闹
  | 'refined_goods'    // T6 书香雅物
  | 'personal_service' // T7 侍从服务（宅邸专属）
  | 'luxury_feast'     // T7 精馔佳肴（宅邸专属）

export type NeedCheck = {
  id: NeedId
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7
  labelCn: string
  deltaIfMet: number
  deltaIfUnmet: number
  chronicThresholdDays: number
}

export type NeedContext = {
  food: number; hasRoad: boolean; dietVariety: number
  hasJob: boolean; savings: number
  nearMarket: boolean; nearAcademy: boolean; nearEntertainment: boolean
  nearTemple: boolean
  nearCulturalVenue: boolean
  isGentry: boolean
  manorServantCount: number
  hasTea: boolean
}

// ─── Citizen motion (was Walker) ─────────────────────────────────────────────

/** All possible walker movement intents. */
export type WalkerPurpose = 'toWork' | 'toHome' | 'toShop' | 'fromShop' | 'patrol'

/**
 * A citizen's current movement state.
 * Replaces the separate Walker type and walkers[] array on CityState.
 * A citizen is "walking" when motion ≠ null.
 */
export type CitizenMotion = {
  route: { x: number; y: number }[]
  routeIndex: number; routeT: number; speed: number
  purpose: WalkerPurpose
  targetId?: string       // market building id (shopping trips)
  cargo?: CropInventory   // goods being carried home
  stepsLeft?: number      // patrol: remaining random-walk steps
}

// ─── Peddler delivery state (was Peddler) ────────────────────────────────────

export type PeddlerCargo = {
  crops: CropInventory
  ironTools: number
}

/**
 * Merchant citizen's active peddler delivery state.
 * Replaces the separate Peddler type and peddlers[] array on CityState.
 * A merchant citizen is "on delivery" when peddlerState ≠ null.
 */
export type PeddlerState = {
  marketId: string
  phase: 'outbound' | 'returning'
  cargo: PeddlerCargo
  fromTile: { x: number; y: number }
  toTile:   { x: number; y: number }
  segT: number; speed: number
  prevTile: { x: number; y: number } | null
  returnRoute: { x: number; y: number }[]
  returnIdx: number
  stepsLeft: number
  statsCargoAtStart: number
  statsHousesServed: number
  statsFoodSold:     number
  statsRevenue:      number
  statsToolsSold:    number
  statsDayCount:     number
}

// ─── Citizen ─────────────────────────────────────────────────────────────────

/** Citizen is now fully self-contained: it owns its movement and job-agent state. */
export type Citizen = {
  id: string
  name: string
  age: number
  gender: Gender
  houseId: string
  workplaceId: string | null
  farmZoneId: string | null
  profession: Profession | null
  satisfaction: number
  needs: CitizenNeeds
  needUnmetTicks: Partial<Record<NeedId, number>>
  isAtHome: boolean
  isSick: boolean
  sickTicks: number
  status: CitizenStatus
  statusTicks: number
  residentTier: 'common' | 'gentry' | 'servant'
  /**
   * Movement state — non-null while the citizen is walking somewhere.
   * Replaces the separate Walker entity and walkers[] array.
   */
  motion: CitizenMotion | null
  /**
   * Peddler delivery state — non-null while a merchant is on a delivery round.
   * Replaces the separate Peddler entity and peddlers[] array.
   */
  peddlerState: PeddlerState | null
}

// ─── Migrant ─────────────────────────────────────────────────────────────────

/** Incoming settler not yet assigned to a house — stays as a top-level array. */
export type Migrant = {
  id: string
  targetHouseId: string
  route: { x: number; y: number }[]
  routeIndex: number; routeT: number; speed: number
  /** Deterministic seed for visual variety (body size, clothing, mount type) */
  seed: number
}

// ─── UI / action types ───────────────────────────────────────────────────────

export type Tool = 'pan' | 'road' | 'bulldoze' | BuildingType

export type LastAction =
  | { kind: 'placeBuilding'; id: string; cost: number }
  | { kind: 'placeRoad'; x: number; y: number }
  | { kind: 'removeBuilding'; building: Building }
  | { kind: 'removeRoad'; x: number; y: number }

export type BuildAttempt = {
  success: boolean; reason: string
  buildType: BuildingType | null; x: number; y: number; ts: number
}

// ─── CityState ───────────────────────────────────────────────────────────────

/**
 * The complete simulation state.
 *
 * Design principle: every entity owns its own mutable sub-state.
 *   Building  → residentData, inventory, agents, tripLog, marketConfig
 *   Citizen   → motion (was Walker), peddlerState (was Peddler)
 *   FarmZone  → piles (was farmPiles[])
 *
 * Top-level CityState contains only:
 *   - True global counters (money, tick, month, …)
 *   - Entity lists (buildings, citizens, farmZones, migrants)
 *   - Terrain health maps (keyed by "x,y" tile)
 *   - Aggregate stats (avgSatisfaction, cityWenmai, …)
 *   - UI-only fields (selected*, lastAction, …) — excluded from saves
 */
export type CityState = {
  money: number; population: number; tick: number; running: boolean
  buildings: Building[]
  roads: { x: number; y: number }[]
  farmZones: FarmZone[]
  citizens: Citizen[]
  migrants: Migrant[]
  taxRates: { ding: number; tian: number; shang: number }
  /**
   * Terrain resource health — unified map.
   * Shape: { [kind: string]: { [tileKey: string]: number } }
   * kind values come from NaturalResourceDef.kind ('ore', 'forest', 'grassland', …).
   * Absent tile key means full health (use resourceInitialHealth(kind) as default).
   */
  terrainResources: Record<string, Record<string, number>>
  month: number
  dayTime: number
  dayCount: number
  lastMonthlyTax: number
  lastHouseholdBuyDay: number
  avgSatisfaction: number
  needPressure: CitizenNeeds
  monthlyFarmOutput: number
  monthlyFarmValue: number
  monthlyMarketSales: number
  lastMonthlyFarmValue: number
  lastMonthlyMarketSales: number
  lastTaxBreakdown: { ding: number; tian: number; shang: number }
  lastMonthlyExpenseBreakdown: { yangmin: number; jianshe: number; total: number }
  monthlyConstructionCost: number
  simSpeed: number
  cityWenmai: number
  cityShangmai: number
  // ── UI-only fields (excluded from saves) ──────────────────────────────────
  selectedBuildingType: BuildingType | null
  selectedTool: Tool
  selectedRoadMode: 'around' | 'over'
  selectedBuildingId: string | null
  selectedCitizenId: string | null
  selectedFarmZoneId: string | null
  /** kind is a NaturalResourceDef.kind or 'mountainForest' (visual alias for 'forest'). */
  selectedTerrainTile: { x: number; y: number; kind: string } | null
  lastAction: LastAction | null
  lastBuildAttempt: BuildAttempt | null
}

