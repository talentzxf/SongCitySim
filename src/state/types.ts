// ─── Building types (宋朝) ─────────────────────────────────────────────────
export type BuildingType =
  | 'house'        // 民居
  | 'market'       // 集市
  | 'granary'      // 粮仓
  | 'blacksmith'   // 铁匠铺
  | 'mine'         // 矿山

export const ALL_BUILDING_TYPES: BuildingType[] = [
  'house', 'market', 'granary', 'blacksmith', 'mine',
]

export type Profession =
  | 'merchant' | 'smith' | 'miner' | 'storekeeper' | 'farmer'

export type CropType = 'rice' | 'millet' | 'wheat' | 'soybean' | 'vegetable'
export type CropInventory = Record<CropType, number>

export type FarmZone = {
  id: string; x: number; y: number
  cropType: CropType
  pendingCropType?: CropType
  growthProgress: number
}

export type RiverTile = { x: number; y: number }

/** 田间收获堆（等待牛车来取） */
export type FarmPile = {
  id: string; zoneId: string
  x: number; y: number
  cropType: CropType; amount: number
  age: number
}

/** 粮仓牛车：粮仓 → 农田堆 → 粮仓 */
export type OxCart = {
  id: string; pileId: string; granaryId: string
  route: { x: number; y: number }[]
  routeIndex: number; routeT: number; speed: number
  pickedUp: boolean
  cargoType: CropType; cargoAmount: number
  pileWaypointIndex: number
}

/** 集市行商：集市 → 粮仓 → 集市（批发） */
export type MarketBuyer = {
  id: string; marketId: string; granaryId: string
  route: { x: number; y: number }[]
  routeIndex: number; routeT: number; speed: number
  pickedUp: boolean
  cargoType: CropType; cargoAmount: number
}

export type Gender = 'male' | 'female'

export type Building = {
  id: string
  type: BuildingType
  x: number; y: number
  capacity: number
  occupants: number
  workerSlots: number
  cost: number
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
  | 'food_basic'     // T1 温饱：houseFood ≥ 2
  | 'food_adequate'  // T2 粮足：houseFood ≥ 8
  | 'shelter'        // T2 道路通达：有路与外界相连
  | 'employment'     // T3 有业可从：有工位或农田
  | 'food_variety'   // T3 饮食多样：≥2 种粮食
  | 'savings'        // T3 积蓄盈余：houseSavings ≥ 20
  | 'food_rich'      // T4 食多味美：≥3 种粮食
  | 'market_access'  // T4 市场便利：附近有集市
  | 'education'      // T5 文教兴旺：附近有学堂
  | 'entertainment'  // T5 娱乐休闲：附近有酒楼/茶馆

export type NeedCheck = {
  id: NeedId
  tier: 1 | 2 | 3 | 4 | 5
  labelCn: string            // 中文短标签（HUD 显示）
  deltaIfMet: number         // 每 tick 满意度加成
  deltaIfUnmet: number       // 每 tick 满意度扣减（负数）
  /** 连续未满足超过此天数后，触发慢性惩罚叠加 */
  chronicThresholdDays: number
}

export type NeedContext = {
  food: number; hasRoad: boolean; dietVariety: number
  hasJob: boolean; savings: number
  nearMarket: boolean; nearAcademy: boolean; nearEntertainment: boolean
}

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
  needs: CitizenNeeds        // 保留用于 HUD 统计（needPressure）
  /** 各需求连续未满足的帧数（满足时归零，长期未满足触发慢性惩罚） */
  needUnmetTicks: Partial<Record<NeedId, number>>
  isAtHome: boolean
  isSick: boolean
  sickTicks: number
  status: CitizenStatus
  statusTicks: number
}

export type Migrant = {
  id: string
  targetHouseId: string
  route: { x: number; y: number }[]
  routeIndex: number; routeT: number; speed: number
}

export type Walker = {
  id: string
  citizenId: string
  route: { x: number; y: number }[]
  routeIndex: number; routeT: number; speed: number
  purpose: 'toWork' | 'toHome' | 'toShop' | 'fromShop'
  targetId?: string
  cargo?: CropInventory
}

export type PeddlerCargo = {
  crops: CropInventory
  ironTools: number
}

export type MarketConfig = { shopkeepers: number; peddlers: number }

/** Stats recorded for a single peddler round-trip. */
export type PeddlerTripStat = {
  peddlerId:    string
  citizenId?:   string
  dayCount:     number
  cargoAtStart: number   // food units loaded at departure
  housesServed: number   // unique households with a paid sale
  foodSold:     number   // food units sold (paid)
  revenue:      number   // money collected (文)
  toolsSold:    number
}

export type Peddler = {
  id: string; marketId: string
  citizenId?: string          // 挑担的真实市民 id（绑定集市工人）
  cargo: PeddlerCargo
  phase: 'outbound' | 'returning'
  stepsLeft: number
  fromTile: { x: number; y: number }
  toTile:   { x: number; y: number }
  segT: number; speed: number
  prevTile: { x: number; y: number } | null
  returnRoute: { x: number; y: number }[]
  returnIdx: number
  // ── trip statistics (reset each departure) ───────────────────────────────
  statsCargoAtStart: number
  statsHousesServed: number
  statsFoodSold:     number
  statsRevenue:      number
  statsToolsSold:    number
  statsDayCount:     number
}

export type Tool = 'pan' | 'road' | 'bulldoze' | 'farmZone' | BuildingType

export type LastAction =
  | { kind: 'placeBuilding'; id: string; cost: number }
  | { kind: 'placeRoad'; x: number; y: number }
  | { kind: 'removeBuilding'; building: Building }
  | { kind: 'removeRoad'; x: number; y: number }

export type BuildAttempt = {
  success: boolean; reason: string
  buildType: BuildingType | null; x: number; y: number; ts: number
}

export type CityState = {
  money: number; population: number; tick: number; running: boolean
  buildings: Building[]
  roads: { x: number; y: number }[]
  farmZones: FarmZone[]
  selectedBuildingType: BuildingType | null
  selectedTool: Tool
  selectedRoadMode: 'around' | 'over'
  selectedBuildingId: string | null
  selectedCitizenId: string | null
  selectedFarmZoneId: string | null
  lastAction: LastAction | null
  lastBuildAttempt: BuildAttempt | null
  citizens: Citizen[]
  houseFood: Record<string, number>
  houseCrops: Record<string, CropInventory>
  houseSavings: Record<string, number>
  taxRates: { ding: number; tian: number; shang: number }
  monthlyFarmOutput: number
  monthlyFarmValue: number
  monthlyMarketSales: number
  lastMonthlyFarmValue: number
  lastMonthlyMarketSales: number
  lastTaxBreakdown: { ding: number; tian: number; shang: number }
  lastMonthlyExpenseBreakdown: { yangmin: number; jianshe: number; total: number }
  monthlyConstructionCost: number
  mineInventory: number
  smithInventory: number
  houseTools: Record<string, number>
  farmInventory: CropInventory
  granaryInventory: CropInventory
  marketInventory: CropInventory
  migrants: Migrant[]
  walkers: Walker[]
  peddlers: Peddler[]
  farmPiles: FarmPile[]
  oxCarts: OxCart[]
  marketBuyers: MarketBuyer[]
  marketConfig: Record<string, MarketConfig>
  peddlerTripLog: Record<string, PeddlerTripStat[]>  // marketId -> last N trips
  month: number
  dayTime: number
  dayCount: number
  lastMonthlyTax: number
  lastHouseholdBuyDay: number
  avgSatisfaction: number
  needPressure: CitizenNeeds
  houseDead: Record<string, number>
  simSpeed: number
}

