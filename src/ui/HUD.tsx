import React from 'react'
import { Alert, Badge, Button, Card, Col, Collapse, Divider, Modal, Progress, Row, Slider, Space, Tabs, Tag, Tooltip, Typography, message } from 'antd'
import {
  CloseOutlined, DeleteOutlined, ExclamationCircleOutlined,
  ExperimentOutlined, HomeOutlined, MedicineBoxOutlined,
  PauseCircleOutlined, PlayCircleOutlined, TeamOutlined, UserOutlined,
  DownloadOutlined, UploadOutlined,
} from '@ant-design/icons'
import { useSimulation, ALL_BUILDING_TYPES, type BuildingType, type Tool, type CropType, type MarketConfig, GRANARY_CAPACITY_PER, MARKET_TOTAL_SLOTS, MARKET_CAP_PER_SHOP, FARM_TOOL_PRICE, TOOL_EFFICIENCY_BONUS, TOOL_DURABILITY_MAX, TOOL_DURABILITY_LOW, ORE_VEIN_INITIAL_HEALTH, FOREST_TILE_INITIAL_HEALTH, GRASSLAND_TILE_INITIAL_HEALTH, ORE_VEIN_TILES, getAggregateCrops, getAggregateBldgUnit, inventoryTotal, createEmptyInventory, DEFAULT_MARKET_CFG } from '../state/simulation'
import { downloadSave, applySaveFile } from '../state/save'
import GameHints from './GameHints'
import configData from '../config/buildings-and-citizens.json'
import { BUILDING_REGISTRY } from '../config/buildings/_loader'
import { JOB_REGISTRY } from '../config/jobs/_loader'
import type { BuildingCategory } from '../config/buildings/_schema'
import { useLevelContext } from '../levels/LevelContext'

// ─── Constants ───────────────────────────────────────────────────────────────

const BUILDING_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(BUILDING_REGISTRY).map(b => [b.id, b.label])
)

// Category display metadata
const CATEGORY_META: Record<BuildingCategory, { label: string; order: number }> = {
  residential: { label: '居住', order: 0 },
  commercial:  { label: '商业', order: 1 },
  industrial:  { label: '工业', order: 2 },
  storage:     { label: '仓储', order: 3 },
  civic:       { label: '公共', order: 4 },
  cultural:    { label: '文化', order: 5 },
}

// Buildings grouped by category, sorted by tier — auto-derived from registry
const ACTIVE_IDS = new Set<string>(ALL_BUILDING_TYPES as string[])
const PALETTE_GROUPS: Array<{ category: BuildingCategory; label: string; buildings: typeof BUILDING_REGISTRY[string][] }> = (() => {
  const groups = new Map<BuildingCategory, typeof BUILDING_REGISTRY[string][]>()
  Object.values(BUILDING_REGISTRY)
    .sort((a, b) => a.tier - b.tier || a.label.localeCompare(b.label))
    .forEach(b => {
      const cat = b.category as BuildingCategory
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat)!.push(b)
    })
  return [...groups.entries()]
    .sort(([a], [b]) => (CATEGORY_META[a]?.order ?? 99) - (CATEGORY_META[b]?.order ?? 99))
    .map(([cat, buildings]) => ({ category: cat, label: CATEGORY_META[cat]?.label ?? cat, buildings }))
})()

// 与 simulation.tsx 中 DEAD_SPREAD_RADIUS 对应，仅用于 UI 文案
const DEAD_SPREAD_RADIUS_HUD = 2

const CROP_LABEL: Record<CropType, string> = {
  rice: '🌾 稻米', millet: '🌻 粟米', wheat: '🌿 麦子', soybean: '🫘 黄豆', vegetable: '🥬 蔬菜', tea: '🍵 茶叶',
}

const GENDER_LABEL: Record<string, string> = { male: '男', female: '女' }

const STATUS_LABEL: Record<string, string> = {
  idle:       '在家闲居',
  commuting:  '通勤途中',
  working:    '在坊劳作',
  farming:    '在田耕作',
  shopping:   '🛒 前往集市',
  returning:  '🏠 买粮回家',
  sick:       '卧病在家',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dayTimeLabel(t: number) {
  const h = Math.floor(t * 24)
  const m = Math.floor((t * 24 - h) * 60)
  const ampm = h < 12 ? '时（午前）' : h === 12 ? '时（正午）' : '时（午后）'
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${displayH}:${String(m).padStart(2, '0')} ${ampm}`
}

function dayPhaseTag(t: number) {
  const phases = Object.values(configData.timePhases) as any[]
  for (const phase of phases) {
    if (t >= phase.range[0] && t < phase.range[1])
      return <Tag color={phase.color}>{phase.label}</Tag>
  }
  return <Tag color="blue">深夜</Tag>
}



// ─── TopBar ─────────────────────────────────────────────────────────────────

function TopBar({
  onTaxClick, onSave, onLoadClick,
}: {
  onTaxClick: () => void
  onSave: () => void
  onLoadClick: () => void
}) {
  const { state, start, stop, setSimSpeed } = useSimulation()
  const { cityName } = useLevelContext()
  const hour = Math.floor(state.dayTime * 24)
  const isNight = state.dayTime < 0.25 || state.dayTime > 0.75
  const timeIcon = isNight ? '🌙' : hour < 8 ? '🌅' : hour < 17 ? '☀️' : '🌆'
  const net = state.lastMonthlyTax - state.lastMonthlyExpenseBreakdown.total
  const netColor = net >= 0 ? '#95de64' : '#ff7875'

  return (
    <div className="top-bar">
      {/* Left: title + time */}
      <div className="top-bar-left">
        <span className="top-bar-title">🏯 永宋 · {cityName}</span>
        <div className="tb-divider tb-hide-mobile" />
        <span className="tb-hide-mobile" style={{ fontSize: 16 }}>{timeIcon}</span>
        <div className="tb-time-detail tb-hide-mobile" style={{ lineHeight: 1.25 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f0d890', letterSpacing: '0.04em' }}>
            第 {state.dayCount} 天
          </div>
          <div style={{ fontSize: 10, color: 'rgba(200,170,90,0.55)', letterSpacing: '0.03em' }}>
            月 {state.month} · {dayTimeLabel(state.dayTime).split('（')[0]}
          </div>
        </div>
        <div className="tb-divider tb-hide-mobile" style={{ marginLeft: 2 }} />
        {/* Running status */}
        <span className="tb-running-badge tb-hide-mobile" style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 4, letterSpacing: '0.1em',
          background: state.running ? 'rgba(82,196,26,0.2)' : 'rgba(180,140,50,0.12)',
          border: `1px solid ${state.running ? 'rgba(82,196,26,0.4)' : 'rgba(180,140,50,0.25)'}`,
          color: state.running ? '#95de64' : 'rgba(200,170,90,0.45)',
        }}>
          {state.running ? '▶ 运行' : '⏸ 暂停'}
        </span>
      </div>

      {/* Center: play/pause + speed */}
      <div className="top-bar-center">
        {state.running
          ? <button className="tb-play-btn pause" data-tutorial="start-btn" onClick={stop}>⏸ 暂停</button>
          : <button className="tb-play-btn play"  data-tutorial="start-btn" onClick={start}>▶ 开始</button>}
        <div className="tb-divider" />
        {([0.25, 1, 2] as const).map(s => (
          <button key={s} className={`tb-speed-btn${state.simSpeed === s ? ' active' : ''}`}
            onClick={() => setSimSpeed(s)}
            title={s === 0.25 ? '慢放（¼速）' : s === 1 ? '正常速度' : '快进（2倍）'}>
            {s === 0.25 ? '¼×' : s === 1 ? '1×' : '2×'}
          </button>
        ))}
      </div>

      {/* Right: stat chips + save/load */}
      <div className="top-bar-right">
        <Tooltip title={`上月收益 ${net >= 0 ? '+' : ''}${net} · 点击调整赋税`}>
          <div className="tb-stat clickable" onClick={onTaxClick}>
            <span className="tb-stat-label">💰 财帛</span>
            <span className="tb-stat-value">¥{Math.floor(state.money)}</span>
          </div>
        </Tooltip>
        <div className="tb-stat">
          <span className="tb-stat-label">👤 户口</span>
          <span className="tb-stat-value">{state.population}</span>
        </div>
        <div className="tb-stat tb-hide-mobile">
          <span className="tb-stat-label">😊 民心</span>
          <span className="tb-stat-value" style={{ color: state.avgSatisfaction >= 70 ? '#95de64' : state.avgSatisfaction >= 40 ? '#ffd666' : '#ff7875' }}>
            {state.avgSatisfaction}%
          </span>
        </div>
        <Tooltip title={`上月净 ${net >= 0 ? '+' : ''}${net}`}>
          <div className="tb-stat tb-hide-mobile">
            <span className="tb-stat-label">📊 月收益</span>
            <span className="tb-stat-value" style={{ color: netColor }}>{net >= 0 ? '+' : ''}{net}</span>
          </div>
        </Tooltip>
        <div className="tb-divider tb-hide-mobile" />
        <Tooltip title="存档（下载）">
          <button className="tb-icon-btn tb-hide-mobile" onClick={onSave} title="存档">💾</button>
        </Tooltip>
        <Tooltip title="读档（加载）">
          <button className="tb-icon-btn tb-hide-mobile" onClick={onLoadClick} title="读档">📂</button>
        </Tooltip>
      </div>
    </div>
  )
}

// ─── StatsPanel (left collapsible) ──────────────────────────────────────────

function StatsPanel({
  onTaxClick, oreClusterPoints, compassIdx, setCompassIdx, focusOreVein,
}: {
  onTaxClick: () => void
  oreClusterPoints: { x: number; y: number }[]
  compassIdx: number
  setCompassIdx: React.Dispatch<React.SetStateAction<number>>
  focusOreVein: () => void
}) {
  const { state } = useSimulation()
  const [collapsed, setCollapsed] = React.useState(() =>
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  )

  const _granariesGlobal = state.buildings.filter(b => b.type === 'granary')
  const _marketsGlobal   = state.buildings.filter(b => b.type === 'market')
  const farmTotal    = state.farmZones.flatMap(z => z.piles).reduce((s, p) => s + p.amount, 0)
  const granaryTotal = inventoryTotal(getAggregateCrops(_granariesGlobal))
  const marketTotal  = inventoryTotal(getAggregateCrops(_marketsGlobal))
  const isShopDay    = state.dayCount % 10 === 0
  const nextShopIn   = 10 - (state.dayCount % 10)

  return (
    <>
      <button
        className={`stats-toggle-btn${collapsed ? '' : ' open'}`}
        onClick={() => setCollapsed(v => !v)}
        title={collapsed ? '展开面板' : '收起面板'}
      >
        {collapsed ? '▶' : '◀'}
      </button>
      <div className={`stats-panel${collapsed ? ' collapsed' : ''}`}>

      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {/* Time detail */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {isShopDay
            ? <Tag color="gold">🛍 旬休采购日</Tag>
            : <Tag color="default" style={{ fontSize: 10 }}>旬休还剩 {nextShopIn} 天</Tag>}
          <Tag color="blue">帧 {state.tick + 1}</Tag>
          <Tag color={state.running ? 'green' : 'default'}>{state.running ? '运行' : '暂停'}</Tag>
        </div>

        {/* Stats grid */}
        <Row gutter={4}>
          <Col span={8}>
            <Tooltip title={`丁税¥${state.lastTaxBreakdown.ding} · 田赋¥${state.lastTaxBreakdown.tian} · 市税¥${state.lastTaxBreakdown.shang} · 养民-¥${state.lastMonthlyExpenseBreakdown.total}`}>
              <Card size="small" style={{ textAlign: 'center', cursor: 'help' }}>
                <Typography.Text type="secondary" style={{ fontSize: 10 }}>上月收益</Typography.Text>
                <div style={{ color: (state.lastMonthlyTax - state.lastMonthlyExpenseBreakdown.total) >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600, fontSize: 12 }}>
                  {(state.lastMonthlyTax - state.lastMonthlyExpenseBreakdown.total) >= 0 ? '+' : ''}{state.lastMonthlyTax - state.lastMonthlyExpenseBreakdown.total}
                </div>
              </Card>
            </Tooltip>
          </Col>
          <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><Typography.Text type="secondary" style={{ fontSize: 10 }}>通勤</Typography.Text><div><Badge count={state.citizens.filter(c => c.motion !== null).length} showZero color="blue" size="small" /> <TeamOutlined /></div></Card></Col>
          <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><Typography.Text type="secondary" style={{ fontSize: 10 }}>月份</Typography.Text><div style={{ fontWeight: 700 }}>{state.month}</div></Card></Col>
        </Row>

        {/* 文脉/商脉 */}
        <Row gutter={4}>
          <Col span={12}>
            <Tooltip title="文脉：书院×12 + 造纸坊×6 + 寺庙×8 + 学子×3。宅邸须文脉≥30">
              <Card size="small" style={{ textAlign: 'center', cursor: 'help', borderColor: state.cityWenmai >= 30 ? '#52c41a' : '#faad14' }}>
                <Typography.Text type="secondary" style={{ fontSize: 10 }}>📚 文脉</Typography.Text>
                <div style={{ fontWeight: 700, fontSize: 12, color: state.cityWenmai >= 30 ? '#52c41a' : '#d4b106' }}>{state.cityWenmai}/100</div>
              </Card>
            </Tooltip>
          </Col>
          <Col span={12}>
            <Tooltip title="商脉：草市×12 + 常平仓×4 + 商贩×3 + 月销售额×0.1（上限30）。宅邸须商脉≥30">
              <Card size="small" style={{ textAlign: 'center', cursor: 'help', borderColor: state.cityShangmai >= 30 ? '#52c41a' : '#faad14' }}>
                <Typography.Text type="secondary" style={{ fontSize: 10 }}>💹 商脉</Typography.Text>
                <div style={{ fontWeight: 700, fontSize: 12, color: state.cityShangmai >= 30 ? '#52c41a' : '#d4b106' }}>{state.cityShangmai}/100</div>
              </Card>
            </Tooltip>
          </Col>
        </Row>

        {/* Need pressure + supply tags */}
        <Space wrap size={3}>
          <Tag color="orange" style={{ fontSize: 10 }}>🍚 食压 {state.needPressure.food}%</Tag>
          <Tag color={state.needPressure.safety > 45 ? 'error' : 'green'} style={{ fontSize: 10 }}>🛡 治安 {state.needPressure.safety}%</Tag>
          <Tag color={state.needPressure.culture > 45 ? 'warning' : 'green'} style={{ fontSize: 10 }}>📚 文化 {state.needPressure.culture}%</Tag>
          <Tag color="green" style={{ fontSize: 10 }}>🌾 田 {farmTotal.toFixed(0)}</Tag>
          <Tag color="gold" style={{ fontSize: 10 }}>🏚 仓 {granaryTotal.toFixed(0)}</Tag>
          <Tag color="blue" style={{ fontSize: 10 }}>🛍 市 {marketTotal.toFixed(0)}</Tag>
          {state.migrants.length > 0 && <Tag color="processing" style={{ fontSize: 10 }}>🐴 入城 {state.migrants.length}</Tag>}
          {(() => { const n = state.citizens.filter(c => c.motion?.purpose === 'patrol').length; return n > 0 ? <Tag color="blue" style={{ fontSize: 10 }}>🏮 巡逻 {n}</Tag> : null })()}
        </Space>

        {/* Compass */}
        <Tooltip title={oreClusterPoints.length > 0 ? `找矿罗盘：跳转到下一处铁矿脉，共 ${oreClusterPoints.length} 处` : '当前地图暂无铁矿脉'}>
          <Button size="small" block onClick={focusOreVein} disabled={oreClusterPoints.length === 0} style={{ fontSize: 11 }}>
            🧭 找矿罗盘
            {oreClusterPoints.length > 0
              ? <Typography.Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>
                  {(compassIdx === 0 ? oreClusterPoints.length : compassIdx)}/{oreClusterPoints.length}处
                </Typography.Text>
              : <Typography.Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>无矿脉</Typography.Text>}
          </Button>
        </Tooltip>

        {/* Advice */}
        <AdvicePanel />
      </Space>
    </div>
    </>
  )
}

// ─── ToolBar (floating pill, bottom center) ──────────────────────────────────

function ToolBar({ onBuildingToggle, buildingOpen, hidden }: { onBuildingToggle: () => void; buildingOpen: boolean; hidden?: boolean }) {
  const { state, selectTool } = useSimulation()
  const tool = state.selectedTool
  const isBuildingActive = buildingOpen || ALL_BUILDING_TYPES.includes(tool as BuildingType)

  return (
    <div className="tool-bar" style={hidden ? { opacity: 0, pointerEvents: 'none', transform: 'translateX(-50%) translateY(20px)', transition: 'opacity 0.2s, transform 0.2s' } : { transition: 'opacity 0.2s, transform 0.2s' }}>
      {/* Group 1: navigation */}
      <button
        className={`tool-btn${tool === 'pan' ? ' active' : ''}`}
        data-tutorial="pan-tool"
        onClick={() => selectTool('pan')}
      >
        <span className="tool-icon">👆</span>
        <span className="tool-label">浏览</span>
      </button>

      <div className="tool-bar-sep" />

      {/* Group 2: terrain tools */}
      {([
        { id: 'road',     icon: '🛤',  label: '道路', tutorial: 'road-tool' },
        { id: 'farmZone', icon: '🌾', label: '粮田', tutorial: 'farmzone-tool' },
        { id: 'teaZone',  icon: '🍵', label: '茶园', tutorial: undefined },
        { id: 'bulldoze', icon: '⛏',  label: '拆除', tutorial: undefined },
      ] as { id: Tool; icon: string; label: string; tutorial?: string }[]).map(t => (
        <button
          key={t.id}
          className={`tool-btn${tool === t.id ? ' active' : ''}`}
          data-tutorial={t.tutorial}
          onClick={() => selectTool(t.id)}
        >
          <span className="tool-icon">{t.icon}</span>
          <span className="tool-label">{t.label}</span>
        </button>
      ))}

      <div className="tool-bar-sep" />

      {/* Group 3: building */}
      <button
        className={`tool-btn building-btn${isBuildingActive ? ' active' : ''}`}
        data-tutorial="building-btn"
        onClick={onBuildingToggle}
      >
        <span className="tool-icon">🏗</span>
        <span className="tool-label">建筑</span>
      </button>
    </div>
  )
}

// ─── BuildingDrawer (slides up from bottom) ──────────────────────────────────

function BuildingDrawer({ open, onClose, paletteGroups }: {
  open: boolean
  onClose: () => void
  paletteGroups: typeof PALETTE_GROUPS
}) {
  const { state, selectTool } = useSimulation()

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Don't close if clicking inside the panel or on the toolbar button itself
      if (target.closest('.building-panel-anchor') || target.closest('.building-btn')) return
      onClose()
    }
    // Delay so the opening click doesn't immediately close
    const tid = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => { clearTimeout(tid); document.removeEventListener('mousedown', handler) }
  }, [open, onClose])

  return (
    <div className="building-panel-anchor">
      <div className={`building-panel${open ? ' open' : ''}`}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e8c870', letterSpacing: '0.08em' }}>🏗 选择建筑</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'rgba(200,160,60,0.5)',
            fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: '0 2px',
          }}>✕</button>
        </div>

        <Tabs
          size="small"
          defaultActiveKey={PALETTE_GROUPS[0]?.category}
          items={paletteGroups.map(group => ({
            key: group.category,
            label: (
              <span data-tutorial={
                group.category === 'storage'     ? 'storage-tab'    :
                group.category === 'commercial'  ? 'commercial-tab' :
                group.category === 'residential' ? 'residential-tab': undefined
              }>
                {group.label}
              </span>
            ),
            children: (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, paddingBottom: 4 }}>
                {group.buildings.map(b => {
                  const active = ACTIVE_IDS.has(b.id)
                  const isSelected = state.selectedTool === b.id
                  return (
                    <Tooltip key={b.id} title={active ? b.desc : `${b.label}：尚未开放`} placement="top">
                      <Button
                        size="small"
                        type={isSelected ? 'primary' : 'default'}
                        data-tutorial={
                          b.id === 'house'   ? 'house-tool'   :
                          b.id === 'granary' ? 'granary-tool' :
                          b.id === 'market'  ? 'market-tool'  : undefined
                        }
                        onClick={() => { if (active) { selectTool(b.id as BuildingType); onClose() } }}
                        style={{ textAlign: 'left', width: '100%', opacity: active ? 1 : 0.35, cursor: active ? 'pointer' : 'not-allowed' }}
                      >
                        {b.icon} {b.label}
                        {active && <span style={{ fontSize: 9, marginLeft: 3, opacity: 0.7 }}>¥{b.cost}</span>}
                      </Button>
                    </Tooltip>
                  )
                })}
              </div>
            ),
          }))}
        />

        {ALL_BUILDING_TYPES.includes(state.selectedTool as BuildingType) && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(220,195,140,0.7)', textAlign: 'center', letterSpacing: '0.05em' }}>
            ✦ 已选【{BUILDING_LABEL[state.selectedTool] ?? state.selectedTool}】— 点击地图格放置
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ToolHintBar (floating above toolbar) ────────────────────────────────────

function ToolHintBar() {
  const { state } = useSimulation()
  const tool = state.selectedTool
  if (tool !== 'farmZone' && tool !== 'teaZone') return null
  return (
    <div style={{
      position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
      zIndex: 19, background: 'rgba(255,251,230,0.96)', border: '1px solid #ffe58f',
      borderRadius: 8, padding: '4px 12px', fontSize: 11, maxWidth: '80vw', textAlign: 'center',
    }}>
      {tool === 'farmZone'
        ? '🌾 粮田：点击河流三格内的平地（绿点），近水种稻，旱地种粟/麦。需紧邻道路耕作。'
        : '🍵 茶园：点击山坡（琥珀色点），选 2×2 全山格梯田。需紧邻山道采摘。'}
    </div>
  )
}

// ─── Main HUD ────────────────────────────────────────────────────────────────

export default function HUD() {
  const { state, start, stop, selectTool, selectTerrainTile, setTaxRates, setSimSpeed, loadSave } = useSimulation()
  const { level } = useLevelContext()

  // ── ESC → pan tool ───────────────────────────────────────────────────────
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (buildingOpen) { setBuildingOpen(false); return }
        if (state.selectedTool !== 'pan') selectTool('pan')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.selectedTool, selectTool])

  const [taxModalOpen, setTaxModalOpen]   = React.useState(false)
  const [buildingOpen, setBuildingOpen]   = React.useState(false)

  // Expose opener to Tutorial (which has no direct access to this state)
  React.useEffect(() => {
    ;(window as any).__OPEN_BUILDING_DRAWER__  = () => setBuildingOpen(true)
    ;(window as any).__CLOSE_BUILDING_DRAWER__ = () => setBuildingOpen(false)
    return () => {
      delete (window as any).__OPEN_BUILDING_DRAWER__
      delete (window as any).__CLOSE_BUILDING_DRAWER__
      delete (window as any).__BUILDING_DRAWER_OPEN__
    }
  }, [])

  // Keep Tutorial informed about current open state
  React.useEffect(() => {
    ;(window as any).__BUILDING_DRAWER_OPEN__ = buildingOpen
  }, [buildingOpen])
  const [compassIdx,   setCompassIdx]     = React.useState(0)
  const [messageApi,   messageCtx]        = message.useMessage()
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // Close building drawer when non-building tool is selected
  React.useEffect(() => {
    if (!ALL_BUILDING_TYPES.includes(state.selectedTool as BuildingType)) {
      // keep drawer state - user may want to re-open
    }
  }, [state.selectedTool])

  const paletteGroups = React.useMemo(() => {
    const lvlAny = level as any
    if (!lvlAny?.allowedBuildings) return PALETTE_GROUPS
    const allowed = new Set<string>(lvlAny.allowedBuildings as string[])
    return PALETTE_GROUPS
      .map(g => ({ ...g, buildings: g.buildings.filter(b => allowed.has(b.id)) }))
      .filter(g => g.buildings.length > 0)
  }, [level])

  const oreClusterPoints = React.useMemo(() => {
    const lvlAny = level as any
    const lb = lvlAny?.mapBounds as { minX: number; maxX: number; minY: number; maxY: number } | undefined
    const tiles = lb
      ? ORE_VEIN_TILES.filter(t => t.x >= lb.minX && t.x <= lb.maxX && t.y >= lb.minY && t.y <= lb.maxY)
      : ORE_VEIN_TILES
    const result: { x: number; y: number }[] = []
    for (const t of tiles) {
      if (result.every(r => Math.hypot(r.x - t.x, r.y - t.y) > 8)) result.push(t)
    }
    return result.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))
  }, [level])

  function focusOreVein() {
    if (oreClusterPoints.length === 0) return
    const tile = oreClusterPoints[compassIdx % oreClusterPoints.length]
    setCompassIdx(i => (i + 1) % oreClusterPoints.length)
    ;(window as any).__ORE_COMPASS_TARGET__ = { x: tile.x, y: tile.y, id: Date.now() }
    selectTerrainTile({ x: tile.x, y: tile.y, kind: 'ore' })
    selectTool('pan')
  }

  function handleSave() {
    stop()
    downloadSave(state)
      .then(() => messageApi.success(`存档已下载：第 ${state.dayCount} 天`))
      .catch((e: any) => messageApi.error(`存档失败：${e?.message ?? '未知错误'}`))
  }
  function handleLoadClick() { fileInputRef.current?.click() }
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const buf = ev.target?.result as ArrayBuffer
        const result = await applySaveFile(buf)
        if (result === 'redirecting') { messageApi.loading('地图种子不同，正在重新生成地图……'); return }
        loadSave(result)
        messageApi.success(`读档成功：第 ${result.state.dayCount} 天（月 ${result.state.month}）`)
      } catch (err: any) { messageApi.error(`读档失败：${err?.message ?? '未知错误'}`) }
    }
    reader.readAsArrayBuffer(file); e.target.value = ''
  }

  // Build feedback toast
  const attempt = state.lastBuildAttempt
  React.useEffect(() => {
    if (!attempt || attempt.success) return
    const reasonMap: Record<string, string> = {
      'no-build-type-selected': '请先选择建造类型。',
      'insufficient-funds': '资金不足，无法建造。',
      'tile-occupied': '格子已被建筑占用。',
      'road-occupied': '格子已有道路，请先推平。',
      'river-occupied': '该处为河流，无法建造。',
      'no-ore-vein': '此处无铁矿脉。',
      'no-forest': '此处无林地。',
      'no-papermill': '书院须在造纸坊（方圆二十格内）附近。',
      'no-river-access': '造纸坊须建于河流五格之内。',
      'no-wenmai': `文脉不足（${state.cityWenmai}/100，需≥30）。`,
      'no-shangmai': `商脉不足（${state.cityShangmai}/100，需≥30）。`,
    }
    const msg = reasonMap[attempt.reason] ?? attempt.reason
    if (msg) messageApi.warning(msg)
  }, [attempt]) // eslint-disable-line

  return (
    <>
      {messageCtx}
      <input ref={fileInputRef} type="file" accept=".citysave,.json" onChange={handleFileChange} style={{ display: 'none' }} />

      {/* ── Top bar ───────────────────────────────── */}
      <TopBar onTaxClick={() => setTaxModalOpen(true)} onSave={handleSave} onLoadClick={handleLoadClick} />

      {/* ── Left stats panel (collapsible) ────────── */}
      <StatsPanel
        onTaxClick={() => setTaxModalOpen(true)}
        oreClusterPoints={oreClusterPoints}
        compassIdx={compassIdx}
        setCompassIdx={setCompassIdx}
        focusOreVein={focusOreVein}
      />

      {/* ── Bottom floating tool bar ──────────────── */}
      <ToolBar
        onBuildingToggle={() => setBuildingOpen(v => !v)}
        buildingOpen={buildingOpen}
        hidden={Boolean(state.selectedBuildingId || state.selectedCitizenId || state.selectedFarmZoneId || state.selectedTerrainTile)}
      />

      {/* ── Tool hint above toolbar ───────────────── */}
      <ToolHintBar />

      {/* ── Building drawer (slides up) ───────────── */}
      <BuildingDrawer open={buildingOpen} onClose={() => setBuildingOpen(false)} paletteGroups={paletteGroups} />

      {/* ── Tax rate modal ────────────────────────── */}
      <TaxModal open={taxModalOpen} onClose={() => setTaxModalOpen(false)} setTaxRates={setTaxRates} />

      {/* ── Right info panel ──────────────────────── */}
      <InfoPanel />
      {/* ── Event-driven game hints ───────────────── */}
      <GameHints />
      {/* ── Mobile building placement bar ─────────── */}
      <MobileBuildingBar />

      {/* ── Debug overlay (top-right) ─────────────── */}
      <DebugOverlay />
    </>
  )
}

// ─── Mobile building placement bar ───────────────────────────────────────────
// Shown on touch devices when a building type tool is active.
// Lets user drag ghost on the map, then tap "放置" to confirm.

function MobileBuildingBar() {
  const { state, selectTool } = useSimulation()
  const isTouch = React.useMemo(() =>
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0), [])

  const tool = state.selectedTool
  const isBuildingTool = ALL_BUILDING_TYPES.includes(tool as BuildingType)
  if (!isTouch || !isBuildingTool) return null

  const def = BUILDING_REGISTRY[tool]
  if (!def) return null

  const [canPlace, setCanPlace] = React.useState(true)
  React.useEffect(() => {
    let raf: number
    const poll = () => {
      const t = (window as any).__MOBILE_PLACEMENT_TILE__
      setCanPlace(t ? t.canPlace !== false : true)
      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(raf)
  }, [])

  function confirm() {
    const fn = (window as any).__CONFIRM_BUILDING_PLACEMENT__
    if (typeof fn === 'function') fn()
  }
  function cancel() {
    const fn = (window as any).__CANCEL_BUILDING_PLACEMENT__
    if (typeof fn === 'function') fn()
    selectTool('pan')
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 90,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 8500,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: 'rgba(10,6,2,0.82)',
      border: '1px solid rgba(200,160,55,0.6)',
      borderRadius: 40,
      padding: '8px 14px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      fontFamily: '"Noto Serif SC","SimSun",serif',
      userSelect: 'none',
      pointerEvents: 'auto',
      whiteSpace: 'nowrap',
    }}>
      {/* Cancel */}
      <button onClick={cancel} style={{
        background: 'rgba(180,60,40,0.25)',
        border: '1px solid rgba(220,80,60,0.5)',
        borderRadius: 24,
        color: '#ffaa99',
        fontSize: 13,
        padding: '6px 16px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        letterSpacing: '0.08em',
      }}>✕ 取消</button>

      {/* Building info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
        <span style={{ fontSize: 20 }}>{def.icon ?? '🏗'}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f0d580', letterSpacing: '0.06em' }}>
            {def.label}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(200,165,100,0.75)' }}>
            ¥{def.cost} · 拖动选位置
          </div>
        </div>
      </div>

      {/* Confirm */}
      <button onClick={confirm} disabled={!canPlace} style={{
        background: canPlace ? 'rgba(40,140,60,0.35)' : 'rgba(80,80,80,0.3)',
        border: `1px solid ${canPlace ? 'rgba(80,200,100,0.6)' : 'rgba(120,120,120,0.4)'}`,
        borderRadius: 24,
        color: canPlace ? '#88ee99' : '#888',
        fontSize: 13,
        padding: '6px 16px',
        cursor: canPlace ? 'pointer' : 'not-allowed',
        fontFamily: 'inherit',
        letterSpacing: '0.08em',
        transition: 'all 0.15s',
      }}>✓ 放置</button>
    </div>
  )
}

// ─── 上奏（城市建议面板）─────────────────────────────────────────────────────

type AdviceItem = { severity: 'error' | 'warning' | 'info'; icon: string; title: string; body: string }

function computeAdvice(state: ReturnType<typeof useSimulation>['state']): AdviceItem[] {
  const items: AdviceItem[] = []
  const pop = state.citizens.length

  // 1. 饥荒 ──────────────────────────────────────────────────────────────────
  const starvingCount = state.citizens.filter(c => (state.buildings.find(b => b.id === c.houseId)?.residentData?.food ?? 0) < 2).length
  if (starvingCount > 0) {
    items.push({
      severity: starvingCount > pop * 0.3 ? 'error' : 'warning',
      icon: '🍚',
      title: `饥寒交迫（${starvingCount}户）`,
      body: starvingCount > pop * 0.3
        ? '城内饿殍遍野，亟需广开仓廪，遣行商至坊间散粮赈济，速建粮仓与集市。'
        : '部分小民存粮告急，宜令行商加紧出行，或降田赋以宽民力。',
    })
  }

  // 2. 无业游民 ──────────────────────────────────────────────────────────────
  const idleCount = state.citizens.filter(c => !c.workplaceId && !c.farmZoneId).length
  if (idleCount > 0) {
    items.push({
      severity: idleCount > pop * 0.4 ? 'error' : 'warning',
      icon: '⛏',
      title: `游手好闲（${idleCount}人待业）`,
      body: idleCount > pop * 0.4
        ? '城中大半居民无所事事，怨声载道，民心不稳。速建集市、粮仓、冶铁厂以安置流民。'
        : '闲散人口渐增，久居无业则民心衰颓。可修筑农地或再开工坊以纳闲丁。',
    })
  }


  // 3. 无路可达 ──────────────────────────────────────────────────────────────
  const noRoadHouses = state.buildings.filter(b =>
    b.type === 'house' &&
    ![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => state.roads.some(r => r.x === b.x+dx && r.y === b.y+dy))
  )
  if (noRoadHouses.length > 0) {
    items.push({
      severity: 'warning',
      icon: '🛤',
      title: `坊巷不通（${noRoadHouses.length}处）`,
      body: '有民居尚无路可达，行商无法上门，居民出行困难。请铺设道路延伸至各坊区。',
    })
  }

  // 4. 疫病 ──────────────────────────────────────────────────────────────────
  const sickCount = state.citizens.filter(c => c.isSick).length
  if (sickCount > 0) {
    const deadHouses = state.buildings.filter(b => (b.residentData?.dead ?? 0) > 0).length
    items.push({
      severity: sickCount > pop * 0.2 ? 'error' : 'warning',
      icon: '🏥',
      title: `疫疠横行（${sickCount}人染病${deadHouses > 0 ? `，${deadHouses}户有亡者` : ''}）`,
      body: deadHouses > 2
        ? '坊间亡者成堆，疫情扩散迅猛，危及全城。亟需修建药铺，并清除亡者，切断传播。'
        : '城内已有染病之民，宜尽早建药铺、保障口粮，以防病情蔓延。',
    })
  }

  // 5. 民心低落 ──────────────────────────────────────────────────────────────
  const lowSatCount = state.citizens.filter(c => c.satisfaction < 40).length
  if (lowSatCount > pop * 0.25) {
    items.push({
      severity: 'warning',
      icon: '😔',
      title: `民心低落（${lowSatCount}人不满）`,
      body: '大批居民怨声载道，安乐度持续走低。可降低苛捐杂税、丰富粮食种类或修建文化场所。',
    })
  }

  // 6. 粮仓空虚 ──────────────────────────────────────────────────────────────
  const mktTotal = inventoryTotal(getAggregateCrops(state.buildings.filter(b => b.type === 'market')))
  const granaryTotal = inventoryTotal(getAggregateCrops(state.buildings.filter(b => b.type === 'granary')))
  if (mktTotal < 2 && granaryTotal < 2 && pop > 0) {
    items.push({
      severity: 'error',
      icon: '🏚',
      title: '仓廪虚空',
      body: '集市与粮仓皆已断粮，城内将陷入大饥。速令农夫增垦良田，并安排行商赶赴收购。',
    })
  }

  // 7. 赋税过重 ──────────────────────────────────────────────────────────────
  if (state.taxRates.ding > 12 || state.taxRates.tian > 0.25 || state.taxRates.shang > 0.15) {
    items.push({
      severity: 'warning',
      icon: '📜',
      title: '苛政猛于虎',
      body: '丁税、田赋或市税课率偏重，百姓积蓄日蹙，采购力不足。建议适度减税，以养民力。',
    })
  }

  // 8. 一切尚好 ──────────────────────────────────────────────────────────────
  if (items.length === 0 && pop > 0) {
    items.push({
      severity: 'info',
      icon: '🌸',
      title: '四境安宁',
      body: '臣等奏曰：城内粮丰民足，百业兴旺，居民安居乐业，请官家宽心。',
    })
  }

  // 9. 文脉/商脉提示（接近宅邸门槛时出现）──────────────────────────────────
  if (pop >= 6 && (state.cityWenmai < 30 || state.cityShangmai < 30)) {
    const lacks: string[] = []
    if (state.cityWenmai  < 30) lacks.push(`文脉 ${state.cityWenmai}/30`)
    if (state.cityShangmai < 30) lacks.push(`商脉 ${state.cityShangmai}/30`)
    items.push({
      severity: 'info',
      icon: '🏯',
      title: `宅邸尚需积累（${lacks.join('、')}）`,
      body: `宅邸须文脉与商脉各达 30 方可建造。文脉：建书院、造纸坊、寺庙；商脉：开草市、设常平仓、发展集市贸易。`,
    })
  }

  return items.sort((a, b) => {
    const rank = { error: 0, warning: 1, info: 2 }
    return rank[a.severity] - rank[b.severity]
  })
}

function AdvicePanel() {
  const { state } = useSimulation()
  const advice = React.useMemo(() => computeAdvice(state), [
    state.citizens, state.buildings, state.roads,
    state.taxRates,
  ])

  if (advice.length === 0) return null
  const top = advice[0]

    return (
    <Collapse size="small" items={[{
      key: 'advice',
      label: (
        <Space size={4}>
          <span style={{ fontSize: 12 }}>📋 上奏</span>
          <Tag color={top.severity === 'error' ? 'error' : top.severity === 'warning' ? 'warning' : 'success'}
            style={{ fontSize: 10, padding: '0 4px' }}>
            {advice.filter(a => a.severity === 'error').length > 0
              ? `${advice.filter(a => a.severity === 'error').length} 急务`
              : advice.filter(a => a.severity === 'warning').length > 0
                ? `${advice.filter(a => a.severity === 'warning').length} 注意`
                : '无虞'}
          </Tag>
        </Space>
      ),
      children: (
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          {advice.map((item, i) => (
            <Alert key={i} showIcon type={item.severity}
              message={<span style={{ fontSize: 12, fontWeight: 600 }}>{item.icon} {item.title}</span>}
              description={<span style={{ fontSize: 11, lineHeight: 1.5 }}>{item.body}</span>}
              style={{ padding: '4px 8px' }} />
          ))}
        </Space>
      ),
    }]} />
  )
}

// ─── Debug overlay (floating, top-right) ────────────────────────────────────

const FPS_HISTORY_LEN = 60   // keep last 60 samples (~30 s at 500 ms interval)

/** SVG sparkline for FPS history */
function FpsSparkline({ history, width = 180, height = 36 }: { history: number[]; width?: number; height?: number }) {
  if (history.length < 2) return null
  const cap = 80  // y-axis top (fps)
  // colour each segment by its fps value
  const segments: React.ReactNode[] = []
  for (let i = 1; i < history.length; i++) {
    const v = history[i]
    const color = v >= 50 ? '#52c41a' : v >= 30 ? '#faad14' : '#ff4d4f'
    const x0 = ((i - 1) / (history.length - 1)) * width
    const y0 = height - (Math.min(history[i - 1], cap) / cap) * height
    const x1 = (i / (history.length - 1)) * width
    const y1 = height - (Math.min(v, cap) / cap) * height
    segments.push(<line key={i} x1={x0.toFixed(1)} y1={y0.toFixed(1)} x2={x1.toFixed(1)} y2={y1.toFixed(1)} stroke={color} strokeWidth="1.5" />)
  }
  // reference lines at 30 and 60 fps
  const y30 = height - (30 / cap) * height
  const y60 = height - (60 / cap) * height
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {/* ref lines */}
      <line x1={0} y1={y60.toFixed(1)} x2={width} y2={y60.toFixed(1)} stroke="#52c41a22" strokeWidth="1" strokeDasharray="3,3" />
      <line x1={0} y1={y30.toFixed(1)} x2={width} y2={y30.toFixed(1)} stroke="#faad1422" strokeWidth="1" strokeDasharray="3,3" />
      {/* labels */}
      <text x={2} y={(y60 - 2).toFixed(1)} fill="#52c41a55" fontSize="8">60</text>
      <text x={2} y={(y30 - 2).toFixed(1)} fill="#faad1455" fontSize="8">30</text>
      {segments}
    </svg>
  )
}

function DebugOverlay() {
  const [visible, setVisible] = React.useState(false)
  const [seed, setSeed] = React.useState('')
  const [fps, setFps] = React.useState<number | null>(null)
  const [frameMs, setFrameMs] = React.useState<number | null>(null)
  const [fpsHistory, setFpsHistory] = React.useState<number[]>([])

  // ── FPS counter via requestAnimationFrame ──────────────────────────────
  React.useEffect(() => {
    let rafId: number
    let frameCount = 0
    let lastUpdate = performance.now()

    function tick(now: number) {
      frameCount++
      if (now - lastUpdate >= 500) {
        const elapsed = now - lastUpdate
        const measured = Math.round((frameCount / elapsed) * 1000)
        const ms = Math.round(elapsed / frameCount)
        setFps(measured)
        setFrameMs(ms)
        setFpsHistory(prev => {
          const next = [...prev, measured]
          return next.length > FPS_HISTORY_LEN ? next.slice(next.length - FPS_HISTORY_LEN) : next
        })
        frameCount = 0
        lastUpdate = now
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const fpsColor = fps === null ? '#888' : fps >= 50 ? '#52c41a' : fps >= 30 ? '#faad14' : '#ff4d4f'
  const fpsLabel = fps === null ? '…' : `${fps}`

  const fpsMin  = fpsHistory.length ? Math.min(...fpsHistory) : null
  const fpsAvg  = fpsHistory.length ? Math.round(fpsHistory.reduce((s, v) => s + v, 0) / fpsHistory.length) : null

  // ── Seed ───────────────────────────────────────────────────────────────
  React.useEffect(() => {
    try {
      const s = (window as any).__WORLD_SEED__
      if (s) setSeed(String(s))
    } catch (e) {}
  }, [])

  function applySeed() {
    try {
      const url = new URL(window.location.href)
      if (seed) url.searchParams.set('seed', seed)
      else url.searchParams.delete('seed')
      window.history.replaceState({}, '', url.toString())
      window.location.reload()
    } catch (e) { console.error(e) }
  }

  return (
    <div style={{ position: 'fixed', top: 58, right: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      {/* Toggle row — FPS badge always visible */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
          color: fpsColor,
          background: 'rgba(20,20,28,0.82)', borderRadius: 4,
          padding: '1px 6px', lineHeight: '20px',
          border: `1px solid ${fpsColor}44`,
        }}>
          {fpsLabel} fps
        </span>
        <Button
          size="small"
          icon={<ExperimentOutlined />}
          onClick={() => setVisible(v => !v)}
          type={visible ? 'primary' : 'default'}
          title="调试信息"
        />
      </div>

      {/* Expanded debug panel */}
      {visible && (
        <div style={{ background: 'rgba(30,30,40,0.92)', border: '1px solid #333', borderRadius: 8, padding: '10px 12px', minWidth: 220, backdropFilter: 'blur(4px)' }}>

          {/* ── FPS section ─────────────────────────────────────────── */}
          <Typography.Text style={{ color: '#aaa', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>🎞 帧率</Typography.Text>

          {/* Main FPS + frame-time row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '4px 0 6px' }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 22, color: fpsColor, lineHeight: 1 }}>
              {fpsLabel}
              <span style={{ fontSize: 11, fontWeight: 400, color: '#888', marginLeft: 3 }}>fps</span>
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#aaa' }}>
              {frameMs !== null ? `${frameMs} ms/帧` : '…'}
            </span>
          </div>

          {/* Sparkline */}
          <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: 4, padding: '4px 4px 2px', marginBottom: 5 }}>
            <FpsSparkline history={fpsHistory} width={196} height={38} />
          </div>

          {/* Min / Avg stats */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#888' }}>
              最低 <b style={{ color: fpsMin !== null && fpsMin < 30 ? '#ff4d4f' : '#bbb' }}>{fpsMin ?? '…'}</b>
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#888' }}>
              均值 <b style={{ color: fpsAvg !== null ? (fpsAvg >= 50 ? '#52c41a' : fpsAvg >= 30 ? '#faad14' : '#ff4d4f') : '#bbb' }}>{fpsAvg ?? '…'}</b>
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#555', marginLeft: 'auto' }}>
              {fpsHistory.length} 样本
            </span>
          </div>

          <div style={{ borderTop: '1px solid #333', marginBottom: 8 }} />

          {/* Seed row */}
          <Typography.Text style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 6 }}>🌍 世界种子</Typography.Text>
          <Space size={4}>
            <input
              style={{ width: 110, background: '#222', border: '1px solid #555', borderRadius: 4, color: '#eee', padding: '2px 6px', fontSize: 12 }}
              value={seed}
              onChange={e => setSeed(e.target.value)}
              placeholder="seed (number)"
            />
            <Button size="small" onClick={() => setSeed(String(Math.floor(Math.random() * 1e9)))}>随机</Button>
            <Button size="small" type="primary" onClick={applySeed}>应用</Button>
          </Space>
        </div>
      )}
    </div>
  )
}

// ─── Tax rate modal (赋税课率) ────────────────────────────────────────────────

const DIET_VARIETY_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: '断炊', color: 'error' },
  1: { label: '粗粝', color: 'default' },
  2: { label: '尚可', color: 'processing' },
  3: { label: '丰盈', color: 'success' },
  4: { label: '饫甘餍肥', color: 'gold' },
  5: { label: '珍馐玉馔', color: 'gold' },
}

function dietVarietyInfo(count: number) {
  return DIET_VARIETY_LABELS[Math.min(count, 5)] ?? DIET_VARIETY_LABELS[1]
}

function TaxModal({ open, onClose, setTaxRates }: {
  open: boolean
  onClose: () => void
  setTaxRates: (r: { ding: number; tian: number; shang: number }) => void
}) {
  const { state } = useSimulation()
  const [rates, setRates] = React.useState(state.taxRates)

  React.useEffect(() => { if (open) setRates(state.taxRates) }, [open])

  // 估算下月课入（以上月实际收成/市销为基准）
  const dingEst  = Math.floor(rates.ding * state.population)
  const tianEst  = Math.floor(state.lastMonthlyFarmValue  * rates.tian)
  const shangEst = Math.floor(state.lastMonthlyMarketSales * rates.shang)

  const dingHigh  = rates.ding  > 12
  const tianHigh  = rates.tian  > 0.25
  const shangHigh = rates.shang > 0.15

  const net = state.lastMonthlyTax - state.lastMonthlyExpenseBreakdown.total

  // ── Tab 1：课税调整 ────────────────────────────────────────────────────────
  const taxTab = (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>

      {/* 丁税 */}
      <Card size="small"
        title={<Space size={4}><span>👤 丁税（人头税）</span>{dingHigh && <Tag color="error" style={{ fontSize: 10 }}>苛政</Tag>}</Space>}
        extra={<Typography.Text type="secondary" style={{ fontSize: 11 }}>户口 {state.population} 丁</Typography.Text>}
      >
        <Slider
          min={0} max={20} step={1}
          value={rates.ding}
          onChange={v => setRates(r => ({ ...r, ding: v }))}
          marks={{ 0: '0', 5: '5文', 10: '10文', 20: '20文' }}
          tooltip={{ formatter: v => `${v} 文/丁·月` }}
          style={{ marginBottom: 8 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography.Text style={{ fontSize: 12 }}>每丁每月课 <b>{rates.ding}</b> 文</Typography.Text>
          <Tag color="gold">预估 ¥{dingEst}</Tag>
        </div>
        {dingHigh && <Alert type="warning" showIcon message="丁税过重，恐引民怨，百姓安乐度将下降。" style={{ marginTop: 6, fontSize: 11, padding: '2px 8px' }} />}
      </Card>

      {/* 田赋 */}
      <Card size="small"
        title={<Space size={4}><span>🌾 田赋（农业税）</span>{tianHigh && <Tag color="error" style={{ fontSize: 10 }}>苛政</Tag>}</Space>}
        extra={<Typography.Text type="secondary" style={{ fontSize: 11 }}>上月田产 ¥{Math.floor(state.lastMonthlyFarmValue)}</Typography.Text>}
      >
        <Slider
          min={0} max={30} step={1}
          value={Math.round(rates.tian * 100)}
          onChange={v => setRates(r => ({ ...r, tian: v / 100 }))}
          marks={{ 0: '0', 10: '10%', 20: '20%', 30: '30%' }}
          tooltip={{ formatter: v => `${v}%` }}
          style={{ marginBottom: 8 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography.Text style={{ fontSize: 12 }}>田产货值课 <b>{Math.round(rates.tian * 100)}%</b></Typography.Text>
          <Tag color="gold">预估 ¥{tianEst}</Tag>
        </div>
        {tianHigh && <Alert type="warning" showIcon message="田赋过重，农夫积极性将受影响，田产可能减少。" style={{ marginTop: 6, fontSize: 11, padding: '2px 8px' }} />}
      </Card>

      {/* 市税 */}
      <Card size="small"
        title={<Space size={4}><span>🛍 市税（商贸税）</span>{shangHigh && <Tag color="error" style={{ fontSize: 10 }}>苛政</Tag>}</Space>}
        extra={<Typography.Text type="secondary" style={{ fontSize: 11 }}>上月市销 ¥{Math.floor(state.lastMonthlyMarketSales)}</Typography.Text>}
      >
        <Slider
          min={0} max={20} step={1}
          value={Math.round(rates.shang * 100)}
          onChange={v => setRates(r => ({ ...r, shang: v / 100 }))}
          marks={{ 0: '0', 5: '5%', 10: '10%', 20: '20%' }}
          tooltip={{ formatter: v => `${v}%` }}
          style={{ marginBottom: 8 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography.Text style={{ fontSize: 12 }}>商贸流水课 <b>{Math.round(rates.shang * 100)}%</b></Typography.Text>
          <Tag color="gold">预估 ¥{shangEst}</Tag>
        </div>
        {shangHigh && <Alert type="warning" showIcon message="市税过重，商贾往来将减少，集市繁荣度下降。" style={{ marginTop: 6, fontSize: 11, padding: '2px 8px' }} />}
      </Card>

      {/* 预估总课入 + 操作按钮 */}
      <Card size="small" style={{ background: '#fffbe6', borderColor: '#ffe58f' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>预估下月总课入</Typography.Text>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#d48806' }}>¥{dingEst + tianEst + shangEst}</div>
            <Typography.Text type="secondary" style={{ fontSize: 10 }}>每月月末结算</Typography.Text>
          </div>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" icon={<span>📜</span>} onClick={() => { setTaxRates(rates); onClose() }}>
              颁布新令
            </Button>
          </Space>
        </div>
      </Card>
    </Space>
  )

  // ── Tab 2：收支报表 ────────────────────────────────────────────────────────
  const reportTab = (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>

      {/* 本月实时 */}
      {state.monthlyConstructionCost > 0 && (
        <Alert
          type="info" showIcon
          message={<span style={{ fontSize: 12 }}>🏗 本月已建造支出 <b>¥{state.monthlyConstructionCost}</b>，将于月末计入报表。</span>}
          style={{ padding: '4px 10px' }}
        />
      )}

      {/* 岁入 */}
      <Card
        size="small"
        title={<Typography.Text strong style={{ color: '#389e0d' }}>▲ 上月岁入（课税）</Typography.Text>}
        style={{ borderColor: '#b7eb8f' }}
      >
        <Space direction="vertical" size={0} style={{ width: '100%' }}>
          {[
            { label: '👤 丁税（人头税）', value: state.lastTaxBreakdown.ding, color: '#d48806' },
            { label: '🌾 田赋（农业税）', value: state.lastTaxBreakdown.tian, color: '#389e0d' },
            { label: '🛍 市税（商贸税）', value: state.lastTaxBreakdown.shang, color: '#096dd9' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
              <Typography.Text style={{ fontSize: 12 }}>{row.label}</Typography.Text>
              <Typography.Text strong style={{ color: row.color, fontSize: 13 }}>+¥{row.value}</Typography.Text>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0 0' }}>
            <Typography.Text strong style={{ fontSize: 12 }}>课入合计</Typography.Text>
            <Typography.Text strong style={{ fontSize: 15, color: '#389e0d' }}>
              +¥{state.lastTaxBreakdown.ding + state.lastTaxBreakdown.tian + state.lastTaxBreakdown.shang}
            </Typography.Text>
          </div>
        </Space>
      </Card>

      {/* 岁出 */}
      <Card
        size="small"
        title={<Typography.Text strong style={{ color: '#cf1322' }}>▼ 上月岁出（开销）</Typography.Text>}
        style={{ borderColor: '#ffccc7' }}
      >
        <Space direction="vertical" size={0} style={{ width: '100%' }}>
          {[
            { label: '👥 养民之费', sub: `每丁2文/月 × ${state.population}丁`, value: state.lastMonthlyExpenseBreakdown.yangmin },
            { label: '🏗 兴工建造', sub: '建筑·桥梁·上月合计',              value: state.lastMonthlyExpenseBreakdown.jianshe },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div>
                <Typography.Text style={{ fontSize: 12 }}>{row.label}</Typography.Text>
                <div><Typography.Text type="secondary" style={{ fontSize: 10 }}>{row.sub}</Typography.Text></div>
              </div>
              <Typography.Text strong style={{ color: '#cf1322', fontSize: 13 }}>-¥{row.value}</Typography.Text>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0 0' }}>
            <Typography.Text strong style={{ fontSize: 12 }}>开销合计</Typography.Text>
            <Typography.Text strong style={{ fontSize: 15, color: '#cf1322' }}>
              -¥{state.lastMonthlyExpenseBreakdown.total}
            </Typography.Text>
          </div>
        </Space>
      </Card>

      {/* 净结余 */}
      <Card
        size="small"
        style={{
          background: net >= 0 ? '#f6ffed' : '#fff1f0',
          borderColor: net >= 0 ? '#52c41a' : '#ff4d4f',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Typography.Text strong style={{ fontSize: 13 }}>上月净结余</Typography.Text>
            <div><Typography.Text type="secondary" style={{ fontSize: 10 }}>= 课入 − 开销</Typography.Text></div>
          </div>
          <Typography.Text strong style={{ fontSize: 22, color: net >= 0 ? '#389e0d' : '#cf1322' }}>
            {net >= 0 ? '+' : ''}¥{net}
          </Typography.Text>
        </div>
        {net < 0 && (
          <Alert type="warning" showIcon message="入不敷出，请减少建造或提高税率。" style={{ marginTop: 8, fontSize: 11, padding: '2px 8px' }} />
        )}
      </Card>

    </Space>
  )

  return (
    <Modal
      title={<Space><span>🏛</span><span>钱谷司 · 财政总览</span></Space>}
      open={open}
      onCancel={onClose}
      footer={null}
      width={500}
      styles={{ body: { paddingTop: 4 } }}
    >
      <Tabs
        defaultActiveKey="tax"
        size="small"
        items={[
          { key: 'tax',    label: '📋 课税调整', children: taxTab },
          { key: 'report', label: '📊 收支报表', children: reportTab },
        ]}
      />
    </Modal>
  )
}

// ─── Terrain tile panel ───────────────────────────────────────────────────────

function TerrainTilePanel() {
  const { state, selectTerrainTile } = useSimulation()
  const tt = state.selectedTerrainTile
  if (!tt) return null

  const { x, y, kind } = tt

  // ── 松柏山林：now harvestable by lumbercamp ───────────────────────────────
  if (kind === 'mountainForest') {
    const health    = state.terrainResources['forest']?.[`${x},${y}`] ?? FOREST_TILE_INITIAL_HEALTH
    const pct       = Math.max(0, Math.round(health / FOREST_TILE_INITIAL_HEALTH * 100))
    const barColor  = pct > 60 ? '#52c41a' : pct > 20 ? '#faad14' : pct > 0 ? '#ff4d4f' : '#d9d9d9'
    return (
      <Space direction="vertical" size={10} style={{ width: '100%', paddingBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space size={6}>
            <Typography.Text strong style={{ fontSize: 15 }}>🌲 松柏山林</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>({x}, {y})</Typography.Text>
          </Space>
          <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => selectTerrainTile(null)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography.Text style={{ fontSize: 12 }}>木材储量</Typography.Text>
          <Tag color={pct > 60 ? 'green' : pct > 20 ? 'orange' : pct > 0 ? 'red' : 'default'}>
            {pct > 0 ? `${pct}%` : '已伐尽'}
          </Tag>
        </div>
        <Progress percent={pct} size="small" showInfo={false} strokeColor={barColor} />
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {health.toFixed(0)} / {FOREST_TILE_INITIAL_HEALTH} 担 · 山地松柏与平地林木同样可由【采木场】采伐。
        </Typography.Text>
        <Alert type="info" showIcon message="在林地格建造【采木场】，伐木工每日采伐半径6格内所有林地（含山地松柏），产出木料。" style={{ borderRadius: 8, fontSize: 12 }} />
      </Space>
    )
  }

  const CONFIGS = {
    ore: {
      icon: '🪨', title: '铁矿脉', color: '#8c8c8c',
      initialHealth: ORE_VEIN_INITIAL_HEALTH,
      healthKey: `${x},${y}`,
      healthMap: state.terrainResources['ore'] ?? {},
      hint: '在矿脉格上建造【矿山】，矿工每日开采铁矿石，供铁匠铺打制农具。',
      unit: '担',
    },
    forest: {
      icon: '🌲', title: '林地', color: '#52c41a',
      initialHealth: FOREST_TILE_INITIAL_HEALTH,
      healthKey: `${x},${y}`,
      healthMap: state.terrainResources['forest'] ?? {},
      hint: '在林地格上建造【采木场】，伐木工每日采伐周边林木，产出木料。',
      unit: '担',
    },
    grassland: {
      icon: '🌿', title: '草地', color: '#73d13d',
      initialHealth: GRASSLAND_TILE_INITIAL_HEALTH,
      healthKey: `${x},${y}`,
      healthMap: state.terrainResources['grassland'] ?? {},
      hint: '草地可供将来放牧。牧草储量耗尽后草地将消失，需休养生息方可复原。',
      unit: '束',
    },
  } as const

  const cfg = CONFIGS[kind as keyof typeof CONFIGS]
  if (!cfg) return null
  const health = cfg.healthMap[cfg.healthKey] ?? cfg.initialHealth
  const pct    = Math.max(0, Math.round(health / cfg.initialHealth * 100))
  const barColor = pct > 60 ? '#52c41a' : pct > 20 ? '#faad14' : pct > 0 ? '#ff4d4f' : '#d9d9d9'

  // Count all tiles of this kind with remaining health (for overview)
  const allHealthMap = cfg.healthMap as Record<string, number>
  const totalTiles   = Object.keys(allHealthMap).length
  const aliveTiles   = Object.values(allHealthMap).filter((v: number) => v > 0).length
  const totalRemain  = Object.values(allHealthMap).reduce((s: number, v: number) => s + v, 0)

  return (
    <Space direction="vertical" size={10} style={{ width: '100%', paddingBottom: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space size={6}>
          <Typography.Text strong style={{ fontSize: 15 }}>{cfg.icon} {cfg.title}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>({x}, {y})</Typography.Text>
        </Space>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => selectTerrainTile(null)} />
      </div>

      {/* This-tile health */}
      <Card size="small" title={`${cfg.icon} 本格储量`} style={{ borderRadius: 8 }}>
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography.Text style={{ fontSize: 12 }}>
              剩余：<b>{health.toFixed(0)}</b> / {cfg.initialHealth} {cfg.unit}
            </Typography.Text>
            <Tag color={pct > 60 ? 'green' : pct > 20 ? 'orange' : pct > 0 ? 'red' : 'default'}>
              {pct > 0 ? `${pct}%` : '已耗尽'}
            </Tag>
          </div>
          <Progress
            percent={pct} size="small" showInfo={false}
            strokeColor={barColor}
          />
          {pct === 0 && (
            <Alert type="warning" showIcon message="此格资源已耗尽，外观已消失。" style={{ padding: '2px 8px', fontSize: 11 }} />
          )}
        </Space>
      </Card>

      {/* Global overview */}
      {totalTiles > 0 && (
        <Card size="small" title="🗺 全图总览" style={{ borderRadius: 8 }}>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <Typography.Text style={{ fontSize: 12 }}>存活格数</Typography.Text>
              <Typography.Text strong style={{ fontSize: 12 }}>{aliveTiles} / {totalTiles}</Typography.Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <Typography.Text style={{ fontSize: 12 }}>全图剩余总量</Typography.Text>
              <Typography.Text strong style={{ fontSize: 12, color: '#52c41a' }}>{totalRemain.toFixed(0)} {cfg.unit}</Typography.Text>
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              地图上彩色圆圈显示各格储量：绿色充沛，黄色减少，红色告急，灰色耗尽。
            </Typography.Text>
          </Space>
        </Card>
      )}

      {/* Hint */}
      <Alert
        type="info" showIcon
        message={cfg.hint}
        style={{ fontSize: 11, borderRadius: 8 }}
      />
    </Space>
  )
}

// ─── Right info panel ─────────────────────────────────────────────────────────

function InfoPanel() {
  const { state } = useSimulation()
  const hasSelection = Boolean(state.selectedBuildingId || state.selectedCitizenId || state.selectedFarmZoneId || state.selectedTerrainTile)
  if (!hasSelection) return null

  return (
    <div className="info-panel" data-tutorial="house-info-panel">
      <div style={{ padding: '12px 12px 0' }}>
        {state.selectedCitizenId
          ? <CitizenPanel />
          : state.selectedFarmZoneId
            ? <FarmZonePanel />
            : state.selectedTerrainTile
              ? <TerrainTilePanel />
              : <BuildingPanel />}
      </div>
    </div>
  )
}

// ─── Farm zone panel ──────────────────────────────────────────────────────────

function FarmZonePanel() {
  const { state, selectFarmZone, setFarmCrop, selectCitizen } = useSimulation()
  const zone = state.farmZones.find(z => z.id === state.selectedFarmZoneId)
  if (!zone) return null

  const isTeaGarden = (zone as any).zoneType === 'tea'
  const assignedFarmers = state.citizens.filter(c => c.farmZoneId === zone.id)

  // 检查农田是否有路可达
  const hasRoadAccess = (() => {
    for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) {
      const tx = zone.x + dx, ty = zone.y + dy
      if (state.roads.some(r => Math.abs(r.x - tx) + Math.abs(r.y - ty) === 1)) return true
    }
    return false
  })()

  // 检查是否有堆积待运（生产停滞）
  const pendingPile = zone.piles.find(p => p.zoneId === zone.id)
  const isBlocked = Boolean(pendingPile)
  const blockReason = isBlocked ? (() => {
    if (!hasRoadAccess)
      return '农田未接通道路，牛车无法抵达。请为农田周围铺设道路。'
    const grans = state.buildings.filter(b => b.type === 'granary')
    if (grans.length === 0)
      return '尚未建造粮仓，无处运粮。请先建造粮仓并连通道路。'
    const hasWorker = grans.some(g => state.citizens.some(c => c.workplaceId === g.id))
    if (!hasWorker)
      return '粮仓没有仓丁，牛车无法出发。请确保粮仓已有工人入驻。'
    return '牛车正在赶来的路上，请稍候…'
  })() : null

  // Crop label without emoji for buttons (only grain fields)
  const CROP_BTN: Record<string, string> = {
    rice: '🌾 稻米', millet: '🌻 粟米', wheat: '🌿 麦子', soybean: '🫘 黄豆', vegetable: '🥬 蔬菜',
  }

  const zoneIcon  = isTeaGarden ? '🍵' : '🌾'
  const zoneTitle = isTeaGarden ? '茶园（山地梯田）' : '粮田'

  return (
    <Space direction="vertical" size={10} style={{ width: '100%', paddingBottom: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space size={6}>
          <Typography.Text strong style={{ fontSize: 15 }}>{zoneIcon} {zoneTitle}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>({zone.x}~{zone.x+1}, {zone.y}~{zone.y+1})</Typography.Text>
        </Space>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => selectFarmZone(null)} />
      </div>

      {/* Road access warning */}
      {!hasRoadAccess && (
        <Alert
          type="warning" showIcon
          message={isTeaGarden ? '茶园未与道路相连' : '粮田未与道路相连'}
          description={isTeaGarden
            ? '山间茶园需紧邻山道（修山路代价较高），茶农才能前来采茶。'
            : '农田需要紧邻道路，农夫才能前来耕作，牛车才能运走粮食。'}
          style={{ fontSize: 12, borderRadius: 8 }}
        />
      )}

      {/* Blocked production alert */}
      {isBlocked && (
        <Alert
          type="error" showIcon
          message={`🚫 产出堆积，生产已停滞（${pendingPile!.amount.toFixed(1)} 担）`}
          description={blockReason ?? ''}
          style={{ fontSize: 12, borderRadius: 8 }}
        />
      )}

      {/* Tea garden info */}
      {isTeaGarden && (
        <Card size="small" title="🍵 茶园信息" style={{ borderRadius: 8 }}>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Typography.Text style={{ fontSize: 12 }}>
              茶叶出产自山地梯田，价值高于普通粮食（每担 ¥8），可售于集市或由行商贩卖。
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              茶园固定种植茶叶，无法更换作物。
            </Typography.Text>
          </Space>
        </Card>
      )}

      {/* Crop selector — only for grain fields */}
      {!isTeaGarden && (
        <Card size="small" title="🌱 种植作物" style={{ borderRadius: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            {(Object.keys(CROP_BTN) as CropType[]).map(crop => {
              const isCurrent = zone.cropType === crop
              const isPending = zone.pendingCropType === crop
              return (
                <Button
                  key={crop}
                  size="small"
                  type={isCurrent ? 'primary' : isPending ? 'dashed' : 'default'}
                  onClick={() => setFarmCrop(zone.id, crop)}
                  style={{ textAlign: 'left', fontSize: 12, position: 'relative' }}
                >
                  {CROP_BTN[crop]}
                  {isPending && (
                    <Tag color="orange" style={{ fontSize: 9, padding: '0 3px', marginLeft: 4, verticalAlign: 'middle' }}>次周期</Tag>
                  )}
                </Button>
              )
            })}
          </div>
          {zone.pendingCropType && zone.pendingCropType !== zone.cropType && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#fa8c16' }}>
              ⏳ 本周期结束后切换为 {CROP_BTN[zone.pendingCropType]}
            </div>
          )}
        </Card>
      )}

      {/* Crop growth progress */}
      <Card size="small" title="📈 作物生长" style={{ borderRadius: 8 }}>
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography.Text style={{ fontSize: 12 }}>{CROP_LABEL[zone.cropType] ?? zone.cropType}</Typography.Text>
            <Space size={4}>
              {zone.growthProgress >= 0.95
                ? <Tag color="gold" style={{ fontSize: 11 }}>{isTeaGarden ? '可采摘！' : '可收获！'}</Tag>
                : zone.growthProgress >= 0.70
                  ? <Tag color="processing" style={{ fontSize: 11 }}>即将成熟</Tag>
                  : zone.growthProgress >= 0.35
                    ? <Tag color="green" style={{ fontSize: 11 }}>生长中</Tag>
                    : zone.growthProgress >= 0.08
                      ? <Tag color="lime" style={{ fontSize: 11 }}>{isTeaGarden ? '茶芽萌发' : '幼苗期'}</Tag>
                      : <Tag style={{ fontSize: 11 }}>{isTeaGarden ? '开垦中' : '播种中'}</Tag>}
              <Typography.Text strong style={{ fontSize: 12 }}>
                {Math.round(zone.growthProgress * 100)}%
              </Typography.Text>
            </Space>
          </div>
          <Progress
            percent={Math.round(zone.growthProgress * 100)}
            size="small"
            showInfo={false}
            strokeColor={
              zone.growthProgress >= 0.95 ? '#fadb14'
              : zone.growthProgress >= 0.70 ? '#faad14'
              : isTeaGarden ? '#2a7530' : '#52c41a'
            }
          />
          {zone.pendingCropType && zone.pendingCropType !== zone.cropType ? (
            <Typography.Text style={{ fontSize: 11, color: '#fa8c16' }}>
              ⏳ 收获后自动切换 → {CROP_LABEL[zone.pendingCropType] ?? zone.pendingCropType}
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {isTeaGarden
                ? '每5游戏日采摘约 9~11 担茶叶·自动转入粮仓'
                : '每5游戏日收获约 8~15 担·自动转入粮仓'}
            </Typography.Text>
          )}
        </Space>
      </Card>

      {/* Assigned farmer list */}
      <Card
        size="small"
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>👨‍🌾 耕作农夫</span>
            {assignedFarmers.length > 0 && (
              <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 400 }}>点击查看详情</Typography.Text>
            )}
          </div>
        }
        style={{ borderRadius: 8 }}
        styles={{ body: { padding: assignedFarmers.length === 0 ? '8px' : '4px 0' } }}
      >
        {assignedFarmers.length === 0
          ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>暂无农夫分配</Typography.Text>
          : assignedFarmers.map(c => {
              const satColor = c.satisfaction >= 70 ? '#52c41a' : c.satisfaction >= 40 ? '#faad14' : '#ff4d4f'
              const statusLabel = c.isAtHome ? '在家' : '耕作中'
              const statusColor = c.isAtHome ? 'default' : 'green'
              return (
                <div key={c.id} className="info-panel-citizen-row"
                  onClick={() => selectCitizen(c.id)}>
                  <Space size={4}>
                    <UserOutlined style={{ color: '#888' }} />
                    <div>
                      <Typography.Text strong style={{ fontSize: 13 }}>{c.name}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>{c.age}岁</Typography.Text>
                    </div>
                  </Space>
                  <Space size={3}>
                    {c.isSick && <Tag color="error" style={{ fontSize: 10, padding: '0 4px' }}>病</Tag>}
                    <Tag color={statusColor} style={{ fontSize: 10, padding: '0 4px' }}>{statusLabel}</Tag>
                    <Tag style={{ fontSize: 10, padding: '0 4px', color: satColor, borderColor: satColor }}>
                      ★{c.satisfaction}
                    </Tag>
                  </Space>
                </div>
              )
            })}
      </Card>

      {/* ── 铁制农具效率提示 ─────────────────────────────────────────── */}
      {(() => {
        const hasMine       = state.buildings.some(b => b.type === 'mine')
        const hasSmith      = state.buildings.some(b => b.type === 'blacksmith')
        const cityToolStock = getAggregateBldgUnit(state.buildings.filter(b => b.type === 'blacksmith'), 'ironTools')
        // 判断此田的农夫是否持有铁器（durability > 0）
        const farmerHasTools = assignedFarmers.some(c => (state.buildings.find(hb => hb.id === c.houseId)?.residentData?.tools ?? 0) > 0)
        const bonusPct = Math.round((TOOL_EFFICIENCY_BONUS - 1) * 100)

        return (
          <Card
            size="small"
            title={
              <Space size={4}>
                <span>🔨 铁制农具</span>
                {farmerHasTools
                  ? <Tag color="success" style={{ fontSize: 10 }}>已装备</Tag>
                  : <Tag color="default" style={{ fontSize: 10 }}>未装备</Tag>}
              </Space>
            }
            style={{ borderRadius: 8, borderColor: farmerHasTools ? '#b7eb8f' : undefined }}
          >
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              {/* 效率状态 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography.Text style={{ fontSize: 12 }}>当前产量加成</Typography.Text>
                {farmerHasTools
                  ? <Tag color="success" style={{ fontSize: 12 }}>+{bonusPct}% 🌾</Tag>
                  : <Tag color="default" style={{ fontSize: 12 }}>+0%（无加成）</Tag>}
              </div>

              {/* 农具耐久明细 */}
              {assignedFarmers.length > 0 && (
                <div style={{ background: '#fafafa', borderRadius: 6, padding: '4px 8px' }}>
                  {assignedFarmers.map(c => {
                    const dur = state.buildings.find(hb => hb.id === c.houseId)?.residentData?.tools ?? 0
                    const durPct = Math.round((dur / TOOL_DURABILITY_MAX) * 100)
                    const isLow = dur > 0 && dur < TOOL_DURABILITY_LOW
                    const isBroken = dur === 0
                    const barColor = dur >= 60 ? '#52c41a' : dur >= TOOL_DURABILITY_LOW ? '#faad14' : '#ff4d4f'
                    return (
                      <div key={c.id} style={{ padding: '4px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                          <Typography.Text style={{ fontSize: 12 }}>{c.name}</Typography.Text>
                          {isBroken
                            ? <Tag color="error"   style={{ fontSize: 10 }}>⚠ 农具毁损</Tag>
                            : isLow
                              ? <Tag color="warning" style={{ fontSize: 10 }}>🔧 即将损耗 {durPct}%</Tag>
                              : <Tag color="success" style={{ fontSize: 10 }}>耐久 {durPct}%</Tag>}
                        </div>
                        {!isBroken && (
                          <Progress
                            percent={durPct}
                            size="small"
                            showInfo={false}
                            strokeColor={barColor}
                          />
                        )}
                        {isBroken && (
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                            农具已毁损，产量下降 {bonusPct}%。请前往集市购置新农器。
                          </Typography.Text>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 城内农具库存 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888' }}>
                <span>🏭 城内铁匠铺存货：</span>
                <span style={{ color: cityToolStock > 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>
                  {cityToolStock} 件
                </span>
              </div>

              {/* 提示：如何获得铁器（点击感叹号展开） */}
              {!farmerHasTools && (() => {
                const warn = !hasMine ? '未建矿山' : !hasSmith ? '未建铁匠铺'
                  : cityToolStock === 0 ? '暂无存货' : null
                const label = `${warn ? warn + ' · ' : ''}如何提升产量 +${bonusPct}%？`
                return (
                  <HintRow color={warn ? '#ff4d4f' : '#faad14'} label={label}>
                    <div>① 建造<b>矿山</b>，矿工每日开采铁矿石</div>
                    <div>② 建造<b>铁匠铺</b>，以矿石打制农具</div>
                    <div style={{ color: '#888', paddingLeft: 14 }}>（曲辕犁·铁锄·铁镰·铁耙·铁铲）</div>
                    <div>③ 农具上架<b>集市</b>代售</div>
                    <div>④ 农夫积够 <b>{FARM_TOOL_PRICE} 文</b>，购粮时顺带购置</div>
                    <div style={{ color: '#52c41a', marginTop: 2 }}>✅ 装备后产量 +{bonusPct}%</div>
                    {!hasMine  && <div style={{ color: '#ff4d4f' }}>⚠ 尚未建造矿山</div>}
                    {!hasSmith && <div style={{ color: '#ff4d4f' }}>⚠ 尚未建造铁匠铺</div>}
                    {hasMine && hasSmith && cityToolStock === 0 && (
                      <div style={{ color: '#faad14' }}>⚠ 铁匠铺暂无存货，等待打制…</div>
                    )}
                  </HintRow>
                )
              })()}
              {farmerHasTools && (
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  曲辕犁·铁锄·铁镰等宋代铁器，令农夫事半功倍。
                </Typography.Text>
              )}
            </Space>
          </Card>
        )
      })()}

      {/* Farm inventory summary */}
      <Card size="small" title="📦 田间库存" style={{ borderRadius: 8 }}>
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {(Object.keys(CROP_BTN) as CropType[]).map(crop => {
            const farmInvForZone = zone.piles.reduce((s, p) => p.cropType === crop ? s + p.amount : s, 0)
            const isActive = zone.cropType === crop
            return (
              <div key={crop} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: isActive ? 1 : 0.38 }}>
                <Typography.Text style={{ fontSize: 12 }}>{CROP_BTN[crop]}</Typography.Text>
                <Space size={2}>
                  <Typography.Text strong style={{ fontSize: 12, color: isActive ? '#52c41a' : undefined }}>{farmInvForZone.toFixed(1)}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>担</Typography.Text>
                  {isActive && <Tag color="green" style={{ fontSize: 10, padding: '0 3px', marginLeft: 2 }}>当前</Tag>}
                </Space>
              </div>
            )
          })}
        </Space>
      </Card>
    </Space>
  )
}

// ─── Collapsible hint (感叹号展开提示，通用模式) ────────────────────────────

function HintRow({ color, label, children }: { color?: string; label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const c = color ?? '#faad14'
  return (
    <>
      <div onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none', padding: '2px 0' }}>
        <ExclamationCircleOutlined style={{ fontSize: 13, color: c, flexShrink: 0 }} />
        <Typography.Text style={{ fontSize: 11, color: c, flex: 1 }}>{label}</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 10 }}>{open ? '收起' : '查看'}</Typography.Text>
      </div>
      {open && (
        <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6, padding: '8px 10px', fontSize: 11, lineHeight: 1.9 }}>
          {children}
        </div>
      )}
    </>
  )
}

function MineNoWorkerHint() {
  return (
    <HintRow color="#ff4d4f" label="无矿工，矿山停产">
      <div>矿山需要居民入驻后才能派遣矿工。</div>
      <div>① 在矿山附近建造<b>民居</b>并接通道路</div>
      <div>② 居民迁入后自动分配到矿山上班</div>
    </HintRow>
  )
}

// ─── House info panel (dark parchment theme) ─────────────────────────────────

function HouseInfoPanel() {
  const { state, selectBuilding, selectCitizen } = useSimulation()
  const b = state.buildings.find(x => x.id === state.selectedBuildingId)
  if (!b) return null

  const isManor = b.type === 'manor'
  const buildingName = isManor ? '宅邸' : '民居'
  const residents = state.citizens.filter(c => c.houseId === b.id)
  const houseFood    = b.residentData?.food ?? 0
  const houseSavings = b.residentData?.savings ?? 0
  const houseCrops   = b.residentData?.crops
  const dietVarietyCount = houseCrops ? Object.values(houseCrops).filter(v => v > 0.1).length : 0
  const dietInfo = DIET_VARIETY_LABELS[Math.min(dietVarietyCount, 5)] ?? DIET_VARIETY_LABELS[1]

  const hasRoadAccess = (() => {
    const bw = b.w ?? 1, bh = b.h ?? 1
    for (let dx = 0; dx < bw; dx++) for (let dy = 0; dy < bh; dy++) {
      const tx = b.x + dx, ty = b.y + dy
      for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
        const nx = tx + ddx, ny = ty + ddy
        if (nx >= b.x && nx < b.x + bw && ny >= b.y && ny < b.y + bh) continue
        if (state.roads.some(r => r.x === nx && r.y === ny)) return true
      }
    }
    return false
  })()

  const sickCount = residents.filter(c => c.isSick).length
  const deadCount = b.residentData?.dead ?? 0
  const avgSat = residents.length > 0
    ? Math.round(residents.reduce((s, c) => s + c.satisfaction, 0) / residents.length)
    : null
  const satColor = avgSat == null ? '#888' : avgSat >= 70 ? '#6dde7a' : avgSat >= 40 ? '#e8c44a' : '#f07070'

  // Dark parchment palette — high contrast
  const C = {
    bg:      'rgba(22,13,4,0.0)',
    section: 'rgba(255,210,50,0.07)',
    border:  'rgba(200,155,50,0.40)',
    title:   '#f0d878',
    text:    '#e8d0a0',
    dim:     '#c4a46e',
    gold:    '#f8e888',
    warn:    '#f5aa48',
    danger:  '#f08080',
    good:    '#80ee90',
  }

  const CROP_ICON: Record<string, string> = {
    rice: '🌾', millet: '🌻', wheat: '🌿', soybean: '🫘', vegetable: '🥬', tea: '🍵',
  }

  return (
    <div style={{ padding: '10px 12px 14px', color: C.text, fontFamily: '"Noto Serif SC","SimSun",serif' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{isManor ? '🏯' : '🏠'}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.gold, letterSpacing: '0.08em' }}>{buildingName}</span>
          <span style={{ fontSize: 11, color: C.text }}>({b.x}, {b.y})</span>
        </div>
        <button onClick={() => selectBuilding(null)} style={{
          background: 'transparent', border: '1px solid rgba(200,155,50,0.3)',
          borderRadius: 4, color: C.dim, fontSize: 13, padding: '2px 8px', cursor: 'pointer',
        }}>✕</button>
      </div>

      {/* ── Key stats row ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10,
      }}>
        {[
          { label: '住户', value: `${residents.length} / ${b.capacity}`, icon: '👥', accent: residents.length >= b.capacity ? C.warn : C.gold },
          { label: '积蓄', value: `¥${houseSavings.toFixed(0)}`, icon: '💰', accent: houseSavings < 5 ? C.danger : C.gold },
          { label: '饮食', value: dietInfo.label, icon: '🍽', accent: dietVarietyCount === 0 ? C.danger : dietVarietyCount >= 3 ? C.good : C.warn },
        ].map(s => (
          <div key={s.label} style={{
            background: C.section, border: `1px solid ${C.border}`,
            borderRadius: 7, padding: '6px 8px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 16 }}>{s.icon}</div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 1 }}>{s.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: s.accent, marginTop: 2 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Satisfaction ── */}
      {avgSat !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: C.section, border: `1px solid ${C.border}`,
          borderRadius: 7, padding: '6px 10px', marginBottom: 10,
        }}>
          <span style={{ fontSize: 13, color: C.text }}>❤ 平均满意度</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 80, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${avgSat}%`, borderRadius: 3, background: satColor, transition: 'width 0.4s' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: satColor }}>{avgSat}</span>
          </div>
        </div>
      )}

      {/* ── Warnings ── */}
      {!hasRoadAccess && (
        <div style={{
          background: 'rgba(200,100,20,0.2)', border: '1px solid rgba(240,140,40,0.6)',
          borderRadius: 7, padding: '7px 10px', marginBottom: 8,
          fontSize: 13, color: '#f5b060',
        }}>⚠ 未与道路相连 — 居民无法通勤</div>
      )}
      {sickCount > 0 && (
        <div style={{
          background: 'rgba(180,50,50,0.2)', border: '1px solid rgba(220,80,80,0.55)',
          borderRadius: 7, padding: '7px 10px', marginBottom: 8,
          fontSize: 13, color: '#f09090',
        }}>🏥 疫情：{sickCount} 人病倒 — 久病不愈将导致死亡</div>
      )}
      {deadCount > 0 && (
        <div style={{
          background: 'rgba(140,30,30,0.25)', border: '1px solid rgba(200,60,60,0.55)',
          borderRadius: 7, padding: '7px 10px', marginBottom: 8,
          fontSize: 13, color: '#f08080',
        }}>💀 亡者 {deadCount} 具 — 积累过多将向邻居传播疫病</div>
      )}
      {houseFood <= 1 && (
        <div style={{
          background: 'rgba(200,80,20,0.2)', border: '1px solid rgba(240,120,40,0.55)',
          borderRadius: 7, padding: '7px 10px', marginBottom: 8,
          fontSize: 13, color: '#f5b060',
        }}>🍚 粮食告急！ — 请确保集市有粮可售</div>
      )}

      {/* ── Food inventory ── */}
      <div style={{
        background: C.section, border: `1px solid ${C.border}`,
        borderRadius: 7, padding: '8px 10px', marginBottom: 10,
      }}>
        <div style={{ fontSize: 12, color: C.title, fontWeight: 700, marginBottom: 6, letterSpacing: '0.08em' }}>
          📦 仓储 · 饮食
        </div>
        {(Object.keys(CROP_LABEL) as CropType[]).map(crop => {
          const amt = houseCrops ? (houseCrops[crop] ?? 0) : (crop === 'rice' ? houseFood : 0)
          const barPct = Math.min(100, (amt / 30) * 100)
          const barColor = amt <= 1 ? '#f08080' : amt < 5 ? '#f0c848' : '#80ee90'
          return (
            <div key={crop} style={{ marginBottom: 5, opacity: amt > 0.05 ? 1 : 0.45 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontSize: 12, color: C.text }}>{CROP_ICON[crop]} {CROP_LABEL[crop]}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: amt > 0.05 ? barColor : C.dim }}>{amt.toFixed(1)} 担</span>
              </div>
              {crop === 'rice' && (
                <div style={{ height: 5, borderRadius: 2, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${barPct}%`, borderRadius: 2, background: barColor, transition: 'width 0.4s' }} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Resident list ── */}
      <div style={{
        background: C.section, border: `1px solid ${C.border}`,
        borderRadius: 7, padding: '8px 10px',
      }}>
        <div style={{ fontSize: 12, color: C.title, fontWeight: 700, marginBottom: 6, letterSpacing: '0.08em' }}>
          {isManor ? '🏯 宅邸住户' : '🏠 住户列表'}
          {residents.length > 0 && <span style={{ fontSize: 11, color: C.dim, marginLeft: 6, fontWeight: 400 }}>点击查看详情</span>}
        </div>
        {residents.length === 0 ? (
          <div style={{ fontSize: 13, color: C.dim, textAlign: 'center', padding: '4px 0' }}>暂无住户</div>
        ) : residents.map(c => {
          const profLabel = c.profession
            ? (JOB_REGISTRY[c.profession]?.label ?? c.profession)
            : c.workplaceId
              ? (BUILDING_LABEL[state.buildings.find(bx => bx.id === c.workplaceId)?.type ?? ''] ?? '工坊') + '工'
              : '待业'
          const cSatColor = c.satisfaction >= 70 ? '#80ee90' : c.satisfaction >= 40 ? '#f0c848' : '#f08080'
          const tierLabel = c.residentTier === 'gentry' ? '贵族' : c.residentTier === 'servant' ? '仆役' : null
          return (
            <div key={c.id}
              onClick={() => selectCitizen(c.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 6px', borderRadius: 6, cursor: 'pointer',
                transition: 'background 0.15s',
                marginBottom: 2,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(200,160,50,0.14)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>👤</span>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.gold }}>{c.name}</span>
                  <span style={{ fontSize: 12, color: C.dim, marginLeft: 5 }}>{c.age}岁 · {profLabel}</span>
                  {tierLabel && <span style={{ fontSize: 10, marginLeft: 5, color: '#f5d86a', border: '1px solid rgba(240,200,60,0.55)', borderRadius: 3, padding: '0 4px' }}>{tierLabel}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {c.isSick && <span style={{ fontSize: 10, color: C.danger, border: `1px solid ${C.danger}`, borderRadius: 3, padding: '0 4px' }}>病</span>}
                <span style={{ fontSize: 11, color: c.isAtHome ? C.dim : '#8ec8ff', border: `1px solid ${c.isAtHome ? 'rgba(196,164,110,0.45)' : 'rgba(120,180,255,0.5)'}`, borderRadius: 3, padding: '0 5px' }}>
                  {c.isAtHome ? '在家' : '通勤'}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: cSatColor }}>★{c.satisfaction}</span>
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}

// ─── Building panel ───────────────────────────────────────────────────────────

function BuildingPanel() {
  const { state, selectBuilding, selectCitizen, setMarketConfig, upgradeBuilding } = useSimulation()
  const b = state.buildings.find(x => x.id === state.selectedBuildingId)
  if (!b) return null

  const isHouse    = b.type === 'house' || b.type === 'manor'

  // House uses dedicated dark-themed panel
  if (isHouse) return <HouseInfoPanel />

  const isMarket   = b.type === 'market'
  const isGranary  = b.type === 'granary'

  // 升级信息（含前置条件）
  const UPGRADE_INFO: Partial<Record<string, {
    maxLevel: number
    levelNames: string[]
    costs: number[]
    /** prereqs[i] = 升到 i+2 级所需的前置建筑类型列表（含显示标签） */
    prereqs?: { buildingType: string; label: string; hint: string }[][]
  }>> = {
    market:  { maxLevel: 2, levelNames: ['草市', '牙市'],   costs: [800] },
    granary: {
      maxLevel: 2,
      levelNames: ['常平仓', '太仓'],
      costs: [600],
      prereqs: [[
        {
          buildingType: 'academy',
          label: '书院',
          hint: '太仓须有书院中会算账的文吏协助管理，方可建立完备的粮册账目。',
        },
      ]],
    },
  }
  const upgradeInfo  = UPGRADE_INFO[b.type]
  const curLevel     = b.level ?? 1
  const buildingName = upgradeInfo ? (upgradeInfo.levelNames[curLevel - 1] ?? BUILDING_LABEL[b.type]) : (BUILDING_LABEL[b.type] ?? b.type)
  const canUpgrade   = upgradeInfo && curLevel < upgradeInfo.maxLevel
  const upgradeCost  = canUpgrade ? upgradeInfo!.costs[curLevel - 1] : 0
  const nextName     = canUpgrade ? upgradeInfo!.levelNames[curLevel] : ''
  // 检查前置条件（每项：是否在城中已建）
  const upgradePrereqChecks = canUpgrade
    ? (upgradeInfo!.prereqs?.[curLevel - 1] ?? []).map(p => ({
        ...p,
        met: state.buildings.some(bd => (bd.type as string) === p.buildingType),
      }))
    : []
  const upgradePrereqsMet = upgradePrereqChecks.every(p => p.met)
  const isBlacksmith = b.type === 'blacksmith'
  const isMine       = b.type === 'mine'
  const isLumbercamp = (b.type as string) === 'lumbercamp'
  const residents  = isHouse ? state.citizens.filter(c => c.houseId === b.id) : []
  const workers    = !isHouse ? state.citizens.filter(c => c.workplaceId === b.id) : []
  const houseFood    = b.residentData?.food ?? 0
  const houseSavings = b.residentData?.savings ?? 0
  const houseCrops   = b.residentData?.crops
  const dietVarietyCount = houseCrops ? Object.values(houseCrops).filter(v => v > 0.1).length : 0

  const mines            = state.buildings.filter(b2 => b2.type === 'mine')
  const smithBuildings   = state.buildings.filter(b2 => b2.type === 'blacksmith')
  const mineCapacity     = mines.length * 60
  const smithCapacity    = smithBuildings.length * 20
  const smithInventory   = getAggregateBldgUnit(smithBuildings, 'ironTools')
  const mineInventory    = getAggregateBldgUnit(mines, 'ironOre')
  const mineOreFillPct   = mineCapacity   > 0 ? Math.min(100, (mineInventory  / mineCapacity)  * 100) : 0
  const smithToolFillPct = smithCapacity  > 0 ? Math.min(100, (smithInventory / smithCapacity) * 100) : 0
  const granaries       = state.buildings.filter(b2 => b2.type === 'granary')
  const granaryCapacity = granaries.reduce((sum, g) => sum + GRANARY_CAPACITY_PER * (g.level ?? 1), 0)
  const granaryInventory= getAggregateCrops(granaries)
  const granaryTotalB   = inventoryTotal(granaryInventory)
  const granaryFillPct  = granaryCapacity > 0 ? Math.min(100, (granaryTotalB / granaryCapacity) * 100) : 0
  const myOxCarts       = b.agents.filter(a => a.kind === 'oxcart')

  // 集市容量 = 坐贾数 × MARKET_CAP_PER_SHOP
  const markets          = state.buildings.filter(b2 => b2.type === 'market')
  const marketCfg: MarketConfig = b.marketConfig ?? DEFAULT_MARKET_CFG
  const marketCapacity   = markets.reduce((sum, m) => {
    const cfg = m.marketConfig ?? DEFAULT_MARKET_CFG
    return sum + cfg.shopkeepers * MARKET_CAP_PER_SHOP
  }, 0)
  const marketInvAgg     = getAggregateCrops(markets)
  const marketTotal      = inventoryTotal(marketInvAgg)
  const marketFillPct    = marketCapacity > 0 ? Math.min(100, (marketTotal / marketCapacity) * 100) : 0
  const myMarketBuyers   = b.agents.filter(a => a.kind === 'marketbuyer')
  const myPeddlers       = state.citizens
    .filter(c => c.peddlerState?.marketId === b.id)
    .map(c => ({ id: c.id, citizenId: c.id, ...c.peddlerState! }))

  // Deterministic role designation: sort workers by id, last cfg.peddlers = 行商, rest = 坐贾
  // This matches the morningCommute selection (.slice from tail) so display = behaviour.
  const workersSortedById = isMarket ? [...workers].sort((a, b2) => a.id.localeCompare(b2.id)) : workers
  const peddlerWorkerIds  = isMarket
    ? new Set(workersSortedById.slice(workersSortedById.length - marketCfg.peddlers).map(w => w.id))
    : new Set<string>()


  const hasRoadAccess = (() => {
    const bw = b.w ?? 1, bh = b.h ?? 1
    for (let dx = 0; dx < bw; dx++) {
      for (let dy = 0; dy < bh; dy++) {
        const tx = b.x + dx, ty = b.y + dy
        for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
          const nx = tx + ddx, ny = ty + ddy
          // skip tiles that are inside the building's own footprint
          if (nx >= b.x && nx < b.x + bw && ny >= b.y && ny < b.y + bh) continue
          if (state.roads.some(r => r.x === nx && r.y === ny)) return true
        }
      }
    }
    return false
  })()

  const CROP_NAME: Record<CropType, string> = { rice: '稻米', millet: '粟米', wheat: '麦子', soybean: '黄豆', vegetable: '蔬菜', tea: '茶叶' }

  return (
    <Space direction="vertical" size={10} style={{ width: '100%', paddingBottom: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space size={6}>
          <Typography.Text strong style={{ fontSize: 15 }}>
            {buildingName}
          </Typography.Text>
          {curLevel >= 2 && <Tag color="gold">已升级</Tag>}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>({b.x}, {b.y})</Typography.Text>
        </Space>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => selectBuilding(null)} />
      </div>

      {/* 升级按钮 */}
      {upgradeInfo && (
        canUpgrade
          ? (
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              {/* 前置条件尚未满足 → 锁定提示 */}
              {upgradePrereqChecks.length > 0 && upgradePrereqChecks.map(p => (
                !p.met && (
                  <Alert
                    key={p.buildingType}
                    type="warning"
                    showIcon
                    icon={<span>🎓</span>}
                    message={<span style={{ fontWeight: 600 }}>升级受阻：缺少【{p.label}】</span>}
                    description={<span style={{ fontSize: 11 }}>{p.hint}</span>}
                    style={{ borderRadius: 8, fontSize: 12 }}
                  />
                )
              ))}
              <Tooltip title={upgradePrereqsMet ? `升级为【${nextName}】，容纳更多人员与货物` : `需先建造前置建筑方可升级`}>
                <Button
                  size="small" type="primary" block
                  disabled={state.money < upgradeCost || !upgradePrereqsMet}
                  onClick={() => upgradeBuilding(b.id)}
                  style={upgradePrereqsMet ? { background: '#d4b106', borderColor: '#a88a04' } : {}}
                >
                  {upgradePrereqsMet
                    ? `升级为【${nextName}】 · ¥${upgradeCost}`
                    : `🔒 升级为【${nextName}】 · ¥${upgradeCost}`}
                </Button>
              </Tooltip>
            </Space>
          )
          : <Tag color="gold" style={{ textAlign: 'center', width: '100%' }}>已达最高等级（{buildingName}）</Tag>
      )}

      {/* Tags */}
      <Space size={6} wrap>
        <Tag>造价 ¥{b.cost}</Tag>
        {isHouse
          ? <Tag color="blue">住户 {residents.length}/{b.capacity}</Tag>
          : <Tag color="purple">
              {isMarket
                ? `在岗 ${workers.length}/${MARKET_TOTAL_SLOTS}`
                : `仓丁 ${workers.length}/${b.workerSlots}`}
            </Tag>}
        {isHouse && <Tag color="gold">💰 积蓄 ¥{houseSavings.toFixed(2)}</Tag>}
        {isHouse && dietVarietyCount > 0 && (
          <Tag color={dietVarietyInfo(dietVarietyCount).color}>
            🍽 {dietVarietyInfo(dietVarietyCount).label}（{dietVarietyCount}种）
          </Tag>
        )}
        <span data-testid="selected-building-label" style={{ display: 'none' }}>{BUILDING_LABEL[b.type]}</span>
        {isHouse && <span data-testid="selected-building-type" style={{ display: 'none' }}>Type: {b.type}</span>}
      </Space>

      {!hasRoadAccess && (
        <Alert type="warning" showIcon message="未与道路相连"
          description="此建筑尚未接通道路，居民无法通勤，迁入率和满意度将受影响。"
          style={{ fontSize: 12, borderRadius: 8 }} />
      )}

      {/* ── 疫病警示 ── */}
      {isHouse && (() => {
        const sickCount = residents.filter(c => c.isSick).length
        const deadCount = b.residentData?.dead ?? 0
        if (sickCount === 0 && deadCount === 0) return null
        return (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {sickCount > 0 && (
              <Alert
                type="error"
                showIcon
                icon={<MedicineBoxOutlined />}
                message={<span style={{ fontWeight: 600 }}>⚠ 疫情：{sickCount} 人病倒</span>}
                description={
                  <span style={{ fontSize: 11 }}>
                    长期缺粮或疫病传染所致。久病不愈（约3个月）将导致死亡。
                    请确保粮食充足，远离病死积聚的邻居。
                  </span>
                }
                style={{ borderRadius: 8 }}
              />
            )}
            {deadCount > 0 && (
              <Alert
                type="error"
                showIcon
                message={<span style={{ fontWeight: 600 }}>💀 此处有 {deadCount} 具亡者未清</span>}
                description={
                  <span style={{ fontSize: 11 }}>
                    亡者积累（≥2具）会向{DEAD_SPREAD_RADIUS_HUD}格内邻居传播疫病！
                    亡者将随时间自然减少，或拆除重建以清除。
                  </span>
                }
                style={{ borderRadius: 8, marginTop: 2 }}
              />
            )}
          </Space>
        )
      })()}

      {/* ── 粮仓：库存与牛车 ── */}
      {isGranary && (
        <Card size="small" title="🏚 粮仓库存" style={{ borderRadius: 8 }}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {/* 总存量 / 容量 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography.Text style={{ fontSize: 12 }}>
                全城合计：<b>{granaryTotalB.toFixed(1)}</b> / {granaryCapacity} 担
              </Typography.Text>
              <Tag color={granaryFillPct >= 90 ? 'error' : granaryFillPct >= 60 ? 'warning' : 'success'}>
                {granaryFillPct.toFixed(0)}% 满
              </Tag>
            </div>
            <Progress
              percent={granaryFillPct}
              size="small" showInfo={false}
              strokeColor={granaryFillPct >= 90 ? '#ff4d4f' : granaryFillPct >= 60 ? '#faad14' : '#52c41a'}
            />
            <Divider style={{ margin: '4px 0', borderColor: '#f0f0f0' }} />
            {/* 各类粮食 */}
            {(Object.keys(CROP_LABEL) as CropType[]).map(crop => {
              const amt = granaryInventory[crop]
              const pct = granaryCapacity > 0 ? (amt / granaryCapacity) * 100 : 0
              return (
                <div key={crop}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <Typography.Text style={{ fontSize: 12, opacity: amt > 0.1 ? 1 : 0.4 }}>{CROP_LABEL[crop]}</Typography.Text>
                    <Typography.Text strong style={{ fontSize: 12, color: amt > 0.1 ? '#52c41a' : '#999' }}>
                      {amt.toFixed(1)} 担
                    </Typography.Text>
                  </div>
                  <Progress percent={pct} size="small" showInfo={false}
                    strokeColor="#52c41a" style={{ marginBottom: 0 }} />
                </div>
              )
            })}
            {granaryFillPct >= 95 && (
              <Alert type="warning" showIcon message="粮仓将满！可增建粮仓扩容。"
                style={{ padding: '2px 8px', fontSize: 11, marginTop: 4 }} />
            )}
          </Space>
        </Card>
      )}

      {/* ── 粮仓：在途牛车 ── */}
      {isGranary && (
        <Card size="small"
          title={<Space size={4}><span>🐂 在途牛车</span><Tag color="blue">{myOxCarts.length}</Tag></Space>}
          style={{ borderRadius: 8 }}
        >
          {myOxCarts.length === 0
            ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>暂无牛车出发</Typography.Text>
            : (
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                {myOxCarts.map(cart => {
                  const isReturn = cart.pickedUp
                  return (
                    <div key={cart.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
                      <Space size={4}>
                        <span style={{ fontSize: 14 }}>🐂</span>
                        <div>
                          <Typography.Text style={{ fontSize: 12 }}>
                            {isReturn
                              ? `回仓中·载 ${cart.cargoAmount.toFixed(1)}担 ${CROP_NAME[cart.cargoType]}`
                              : '前往农田取粮…'}
                          </Typography.Text>
                        </div>
                      </Space>
                      <Tag color={isReturn ? 'success' : 'processing'} style={{ fontSize: 10 }}>
                        {isReturn ? '满载返回' : '去程'}
                      </Tag>
                    </div>
                  )
                })}
              </Space>
            )}
        </Card>
      )}

      {/* ── 矿山：铁矿石库存 + 矿脉储量 ── */}
      {isMine && (() => {
        const tileKey = `${b.x},${b.y}`
        const oreHealth = state.terrainResources['ore']?.[tileKey] ?? ORE_VEIN_INITIAL_HEALTH
        const oreHealthPct = Math.round(oreHealth / ORE_VEIN_INITIAL_HEALTH * 100)
        return (
          <Card size="small" title="⛏ 铁矿石存量" style={{ borderRadius: 8 }}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography.Text style={{ fontSize: 12 }}>
                  全城存矿：<b>{mineInventory.toFixed(1)}</b> / {mineCapacity} 担
                </Typography.Text>
                <Tag color={mineOreFillPct >= 90 ? 'error' : mineOreFillPct >= 60 ? 'warning' : 'success'}>
                  {mineOreFillPct.toFixed(0)}% 满
                </Tag>
              </div>
              <Progress percent={mineOreFillPct} size="small" showInfo={false}
                strokeColor={mineOreFillPct >= 90 ? '#ff4d4f' : '#52c41a'} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888' }}>
                <span>每矿工每日产出 3 担</span>
                <span>在岗 {workers.length} 人</span>
              </div>
              {/* 矿脉储量 */}
              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Typography.Text style={{ fontSize: 12 }}>🪨 本格矿脉剩余储量</Typography.Text>
                  <Tag color={oreHealthPct > 60 ? 'green' : oreHealthPct > 20 ? 'orange' : oreHealthPct > 0 ? 'red' : 'default'}>
                    {oreHealthPct > 0 ? `${oreHealthPct}%` : '已枯竭'}
                  </Tag>
                </div>
                <Progress percent={oreHealthPct} size="small" showInfo={false}
                  strokeColor={oreHealthPct > 60 ? '#52c41a' : oreHealthPct > 20 ? '#fa8c16' : '#ff4d4f'} />
                <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                  {oreHealth.toFixed(0)} / 600 担 · 选中矿坑时地图显示各矿脉颜色
                </Typography.Text>
              </div>
              {workers.length === 0 && <MineNoWorkerHint />}
            </Space>
          </Card>
        )
      })()}

      {/* ── 采木场：周边林木储量 ── */}
      {isLumbercamp && (() => {
        const FOREST_MAX = FOREST_TILE_INITIAL_HEALTH
        const HARVEST_R  = 6
        // 从 state.terrainResources['forest'] 统计在岗半径内的格子
        const nearbyKeys = Object.entries(state.terrainResources['forest'] ?? {}).filter(([key]) => {
          const [fx, fy] = key.split(',').map(Number)
          return Math.max(Math.abs(fx - b.x), Math.abs(fy - b.y)) <= HARVEST_R
        })
        const totalRemain = nearbyKeys.reduce((s, [, v]) => s + v, 0)
        const totalMax    = nearbyKeys.length * FOREST_MAX
        const forestPct   = totalMax > 0 ? Math.round(totalRemain / totalMax * 100) : 0
        return (
          <Card size="small" title="🌲 周边林木储量" style={{ borderRadius: 8 }}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography.Text style={{ fontSize: 12 }}>
                  全城木料库存：<b>{getAggregateBldgUnit(state.buildings.filter(b2 => (b2.type as string) === 'lumbercamp'), 'timber').toFixed(0)}</b> 担
                </Typography.Text>
                <Tag color={forestPct > 60 ? 'green' : forestPct > 20 ? 'orange' : forestPct > 0 ? 'red' : 'default'}>
                  {forestPct > 0 ? `${forestPct}% 剩余` : '周边已伐尽'}
                </Tag>
              </div>
              <Progress percent={forestPct} size="small" showInfo={false}
                strokeColor={forestPct > 60 ? '#52c41a' : forestPct > 20 ? '#fa8c16' : '#ff4d4f'} />
              <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                周边 {HARVEST_R} 格内：{nearbyKeys.length} 块林地 · 总储量 {totalRemain.toFixed(0)}/{totalMax} 担
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                选中采木场时，地图上各林地格以绿/黄/红标示剩余储量
              </Typography.Text>
              {workers.length === 0 && (
                <Alert type="warning" showIcon message="无在岗伐木工，请安排居民前来务工" style={{ padding: '2px 8px', fontSize: 11 }} />
              )}
            </Space>
          </Card>
        )
      })()}

      {/* ── 铁匠铺：农具库存 ── */}
      {isBlacksmith && (
        <Card size="small" title="🔨 铁制农具存量" style={{ borderRadius: 8 }}>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography.Text style={{ fontSize: 12 }}>
                全城存货：<b>{smithInventory}</b> / {smithCapacity} 件
              </Typography.Text>
              <Tag color={smithToolFillPct >= 90 ? 'error' : smithInventory > 0 ? 'success' : 'default'}>
                {smithInventory > 0 ? `${smithToolFillPct.toFixed(0)}% 充盈` : '无存货'}
              </Tag>
            </div>
            <Progress percent={smithToolFillPct} size="small" showInfo={false}
              strokeColor={smithInventory > 0 ? '#52c41a' : '#d9d9d9'} />
            {/* 宋代农具清单 */}
            <div style={{ background: '#fafafa', borderRadius: 6, padding: '6px 8px' }}>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>宋代铁制农具（轮流打制）：</Typography.Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {[
                  { label: '曲辕犁', tip: '翻土耕田，效率极高' },
                  { label: '铁锄',   tip: '锄草松土' },
                  { label: '铁镰',   tip: '收割稻麦' },
                  { label: '铁耙',   tip: '碎土整地' },
                  { label: '铁铲',   tip: '开渠起垄' },
                ].map(({ label, tip }) => (
                  <Tooltip key={label} title={tip}>
                    <Tag style={{ cursor: 'default', fontSize: 11 }}>{label}</Tag>
                  </Tooltip>
                ))}
              </div>
            </div>
            <Space direction="vertical" size={2} style={{ fontSize: 11, color: '#888', width: '100%' }}>
              <div>🔨 每铁匠每日打制：1件农具（消耗矿石2担）</div>
              <div>⛏ 当前矿石库存：{mineInventory.toFixed(1)}担
                {mineInventory < 2 && <Tag color="error" style={{ marginLeft: 6, fontSize: 10 }}>矿石不足</Tag>}
              </div>
              <div>💰 农具售价：{FARM_TOOL_PRICE}文/套 · 农夫持有后产量 +{Math.round((TOOL_EFFICIENCY_BONUS - 1) * 100)}%</div>
            </Space>
            {workers.length === 0 && (
              <Alert type="warning" showIcon message="铁匠铺无铁匠，无法锻造农具。"
                style={{ padding: '2px 8px', fontSize: 11 }} />
            )}
            {mines.length === 0 && (
              <Alert type="info" showIcon message="尚未建造矿山，无铁矿石原料。"
                style={{ padding: '2px 8px', fontSize: 11 }} />
            )}
          </Space>
        </Card>
      )}

      {/* ── 集市：货物与容量 ── */}
      {isMarket && (
        <Card size="small" style={{ borderRadius: 8 }}>
          {/* 坐贾/行商人员分配 */}
          <div style={{ padding: '8px 12px 4px', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Typography.Text style={{ fontSize: 12 }}>
                坐贾 <b>{marketCfg.shopkeepers}</b> 人 · 行商 <b>{marketCfg.peddlers}</b> 人
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 10 }}>总名额 {MARKET_TOTAL_SLOTS} 人</Typography.Text>
            </div>
            <Slider
              min={0} max={MARKET_TOTAL_SLOTS} step={1}
              value={marketCfg.peddlers}
              onChange={v => setMarketConfig(b.id, { peddlers: v, shopkeepers: MARKET_TOTAL_SLOTS - v })}
              tooltip={{ formatter: v => `行商 ${v} 人 / 坐贾 ${MARKET_TOTAL_SLOTS - (v??0)} 人` }}
              marks={{ 0: '全坐贾', 2: '默认', [MARKET_TOTAL_SLOTS]: '全行商' }}
              style={{ marginBottom: 4 }}
            />
            {marketCfg.shopkeepers === 0 && (
              <Typography.Text type="secondary" style={{ fontSize: 10, color: '#ff4d4f' }}>
                ⚠ 无坐贾时货架容量为 0，集市无法存货
              </Typography.Text>
            )}
          </div>
          <Tabs size="small" defaultActiveKey="food" items={[
            {
              key: 'food',
              label: <span>🌾 粮食</span>,
              children: (
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography.Text style={{ fontSize: 12 }}>
                      货架：<b>{marketTotal.toFixed(1)}</b> / {marketCapacity} 担
                    </Typography.Text>
                    <Tag color={marketFillPct < 20 ? 'error' : marketFillPct < 50 ? 'warning' : 'success'}>
                      {marketFillPct.toFixed(0)}% 充盈
                    </Tag>
                  </div>
                  <Progress percent={marketFillPct} size="small" showInfo={false}
                    strokeColor={marketFillPct < 20 ? '#ff4d4f' : marketFillPct < 50 ? '#faad14' : '#52c41a'} />
                  <Divider style={{ margin: '4px 0', borderColor: '#f0f0f0' }} />
                  {(Object.keys(CROP_LABEL) as CropType[]).map(crop => {
                    const amt = marketInvAgg[crop]
                    return (
                      <div key={crop} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: amt > 0 ? 1 : 0.38 }}>
                        <Typography.Text style={{ fontSize: 12 }}>{CROP_LABEL[crop]}</Typography.Text>
                        <Space size={3}>
                          <Typography.Text strong style={{ fontSize: 12, color: amt > 0 ? '#52c41a' : undefined }}>
                            {amt.toFixed(1)}
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>担</Typography.Text>
                          {amt <= 0 && <Tag style={{ fontSize: 10, padding: '0 3px' }}>缺货</Tag>}
                        </Space>
                      </div>
                    )
                  })}
                </Space>
              ),
            },
            {
              key: 'tools',
              label: <span>🔧 农具 <Tag color={smithInventory > 0 ? 'green' : 'default'} style={{ fontSize: 10 }}>{smithInventory}件</Tag></span>,
              children: (() => {
                const smithWorkerCount = smithBuildings.reduce((n, sb) =>
                  n + state.citizens.filter(c => c.workplaceId === sb.id && !c.isSick).length, 0)
                return (
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography.Text style={{ fontSize: 12 }}>
                        货架：<b>{smithInventory}</b> / {smithCapacity} 件
                      </Typography.Text>
                      <Tag color={smithToolFillPct >= 90 ? 'error' : smithInventory > 0 ? 'success' : 'default'}>
                        {smithInventory > 0 ? `${smithToolFillPct.toFixed(0)}% 充盈` : '无存货'}
                      </Tag>
                    </div>
                    <Progress percent={smithToolFillPct} size="small" showInfo={false}
                        strokeColor={smithInventory > 0 ? '#52c41a' : '#d9d9d9'} />
                    <div style={{ background: '#fafafa', borderRadius: 6, padding: '6px 8px' }}>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>宋代铁制农具（轮流打制）：</Typography.Text>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {[
                          { label: '曲辕犁', tip: '翻土耕田，效率极高' },
                          { label: '铁锄', tip: '锄草松土' },
                          { label: '铁镰', tip: '收割稻麦' },
                          { label: '铁耙', tip: '碎土整地' },
                          { label: '铁铲', tip: '开渠起垄' },
                        ].map(({ label, tip }) => (
                          <Tooltip key={label} title={tip}>
                            <Tag style={{ cursor: 'default', fontSize: 11 }}>{label}</Tag>
                          </Tooltip>
                        ))}
                      </div>
                    </div>
                    <Space direction="vertical" size={2} style={{ fontSize: 11, color: '#888', width: '100%' }}>
                      <div>🔨 铁匠铺在岗：{smithWorkerCount} 人 · ⛏ 矿石：{mineInventory.toFixed(1)} 担
                        {mineInventory < 2 && <Tag color="error" style={{ marginLeft: 6, fontSize: 10 }}>矿石不足</Tag>}
                      </div>
                      <div>💰 售价：{FARM_TOOL_PRICE} 文/套 · 行商沿途或居民来集市均可购</div>
                    </Space>
                    {smithBuildings.length === 0 && (
                      <Alert type="info" showIcon message="尚未建造铁匠铺，集市无农具可售。" style={{ padding: '2px 8px', fontSize: 11 }} />
                    )}
                  </Space>
                )
              })(),
            },
            {
              key: 'logistics',
              label: (
                <span>
                  🛺 物流
                  {(myMarketBuyers.length + myPeddlers.length) > 0 &&
                    <Tag color="blue" style={{ fontSize: 10, marginLeft: 3 }}>{myMarketBuyers.length + myPeddlers.length}</Tag>}
                </span>
              ),
              children: (
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  {/* 独轮车（进货） */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <Typography.Text style={{ fontSize: 12 }}>独轮车（粮仓进货）</Typography.Text>
                    <Tag color="blue">{myMarketBuyers.length}</Tag>
                  </div>
                  {myMarketBuyers.map(mb => {
                    const isReturn = mb.pickedUp
                    const granaryB = state.buildings.find(g => g.id === mb.srcGranaryId)
                    return (
                      <div key={mb.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0' }}>
                        <Space size={4}>
                          <span>🛺</span>
                          <Typography.Text style={{ fontSize: 11 }}>
                            {isReturn ? `回市·载 ${mb.cargoAmount.toFixed(1)}担 ${CROP_NAME[mb.cargoType]}` : `往粮仓${granaryB ? `(${granaryB.x},${granaryB.y})` : ''}…`}
                          </Typography.Text>
                        </Space>
                        <Tag color={isReturn ? 'success' : 'processing'} style={{ fontSize: 10 }}>{isReturn ? '返回' : '去程'}</Tag>
                      </div>
                    )
                  })}

                  <Divider style={{ margin: '2px 0', borderColor: '#f0f0f0' }} />

                  {/* 行商（送货上门） */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <Typography.Text style={{ fontSize: 12 }}>行商（走街串巷）</Typography.Text>
                    <Tag color="purple">{myPeddlers.length} / {marketCfg.peddlers}</Tag>
                  </div>
                  {myPeddlers.length === 0
                    ? <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {marketCfg.peddlers === 0 ? '未配置行商' : '行商已归市，明日清晨出发'}
                      </Typography.Text>
                    : myPeddlers.map(p => {
                        const foodAmt = Object.values(p.cargo.crops).reduce((s, v) => s + v, 0)
                        return (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0' }}>
                            <Space size={4}>
                              <span>🧺</span>
                              <Typography.Text style={{ fontSize: 11 }}>
                                {p.phase === 'outbound'
                                  ? `出行中 剩${p.stepsLeft}步 · 粮${foodAmt.toFixed(1)}担 铁器×${p.cargo.ironTools}`
                                  : `折返中 · 剩余粮${foodAmt.toFixed(1)}担 铁器×${p.cargo.ironTools}`}
                              </Typography.Text>
                            </Space>
                            <Tag color={p.phase === 'outbound' ? 'purple' : 'default'} style={{ fontSize: 10 }}>
                              {p.phase === 'outbound' ? '出行' : '返回'}
                            </Tag>
                          </div>
                        )
                      })}
                  <Typography.Text type="secondary" style={{ fontSize: 10, marginTop: 2 }}>
                    行商最多走 30 格后 A* 折返；沿途向民居/农田按需售货
                  </Typography.Text>
                </Space>
              ),
            },
            {
              key: 'peddler_stats',
              label: <span>📊 行商统计</span>,
              children: (() => {
                const tripLog   = b.tripLog ?? []
                const activePeddlers = myPeddlers
                return (
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    {/* ── 在途行商实时进度 ── */}
                    {activePeddlers.length > 0 && (
                      <div>
                        <Typography.Text strong style={{ fontSize: 12 }}>🧺 本轮出行中</Typography.Text>
                        {activePeddlers.map(p => {
                          const citizen = p.citizenId ? state.citizens.find(c => c.id === p.citizenId) : null
                          const cargoLeft = Object.values(p.cargo.crops).reduce((s, v) => s + v, 0)
                          return (
                            <div key={p.id} style={{ background: '#f9f0ff', borderRadius: 6, padding: '6px 8px', marginTop: 4 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography.Text strong style={{ fontSize: 12 }}>
                                  {citizen?.name ?? '行商'} · {p.phase === 'outbound' ? `剩 ${p.stepsLeft} 步` : '折返中'}
                                </Typography.Text>
                                <Tag color="purple" style={{ fontSize: 10 }}>{p.phase === 'outbound' ? '出行' : '返回'}</Tag>
                              </div>
                              <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                                出发带货：{p.statsCargoAtStart.toFixed(1)} 担 ·
                                剩余：{cargoLeft.toFixed(1)} 担 ·
                                铁器×{p.cargo.ironTools}
                              </div>
                              <div style={{ fontSize: 11, color: '#52c41a', marginTop: 1 }}>
                                ✅ 已服务 {p.statsHousesServed} 户 ·
                                售粮 {p.statsFoodSold.toFixed(1)} 担 ·
                                收入 {p.statsRevenue.toFixed(1)} 文
                                {p.statsToolsSold > 0 && ` · 售器×${p.statsToolsSold}`}
                              </div>
                              {p.statsCargoAtStart < 0.1 && (
                                <div style={{ fontSize: 11, color: '#ff4d4f', marginTop: 1 }}>
                                  ⚠ 出发时市场无粮，空手出行
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* ── 历史行程记录 ── */}
                    {tripLog.length > 0 && (
                      <div>
                        <Typography.Text strong style={{ fontSize: 12 }}>📋 近期行程记录</Typography.Text>
                        {[...tripLog].reverse().map((t, i) => {
                          const citizen = t.citizenId ? state.citizens.find(c => c.id === t.citizenId) : null
                          return (
                            <div key={i} style={{ background: '#f6ffed', borderRadius: 6, padding: '6px 8px', marginTop: 4 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography.Text strong style={{ fontSize: 12 }}>
                                  {citizen?.name ?? t.citizenId?.slice(-4) ?? '行商'} · 第 {t.dayCount} 天
                                </Typography.Text>
                                <Tag color={t.housesServed > 0 ? 'success' : 'default'} style={{ fontSize: 10 }}>
                                  {t.housesServed > 0 ? `售货 ${t.housesServed} 户` : '零成交'}
                                </Tag>
                              </div>
                              <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                                出发带货：{t.cargoAtStart.toFixed(1)} 担
                                {t.cargoAtStart < 0.1 && <Tag color="error" style={{ fontSize: 10, marginLeft: 4 }}>市场空仓</Tag>}
                              </div>
                              {t.housesServed > 0
                                ? <div style={{ fontSize: 11, color: '#52c41a', marginTop: 1 }}>
                                    ✅ 售粮 {t.foodSold.toFixed(1)} 担 · 收入 {t.revenue.toFixed(1)} 文
                                    {t.toolsSold > 0 && ` · 售农器×${t.toolsSold}`}
                                  </div>
                                : <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>
                                    未售出（见下方条件说明）
                                  </div>
                              }
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {activePeddlers.length === 0 && tripLog.length === 0 && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        行商今日尚未出发，明晨清晨（6:00）自动派出
                      </Typography.Text>
                    )}

                    {/* ── 卖货条件说明 ── */}
                    <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6, padding: '8px 10px', fontSize: 11 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>📌 行商卖货条件（全部满足才成交）</div>
                      <div>① 行商携带粮食 &gt; 0.1 担（市场出发时有库存）</div>
                      <div>② 民居在行商当前格<b>上下左右 1 格</b>之内（斜对角无效）</div>
                      <div>③ 民居粮食 &lt; <b>10 担</b>（已满仓则跳过）</div>
                      <div>④ 民居积蓄 &gt; 0（无钱则仅施舍 1 担，不收费）</div>
                      <div style={{ marginTop: 4, color: '#888' }}>
                        常见零成交原因：市场空仓出发 / 民居粮食充足 / 民居积蓄不足
                      </div>
                    </div>
                  </Space>
                )
              })(),
            },
          ]} />
        </Card>
      )}

      {/* ── House: inventory ── */}
      {isHouse && (
        <Card size="small" title={<span>📦 仓储 · 饮食</span>} style={{ borderRadius: 8 }}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {/* Diet variety tag */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>饮食丰俭</Typography.Text>
              <Tag color={dietVarietyInfo(dietVarietyCount).color}>
                {dietVarietyInfo(dietVarietyCount).label}（{dietVarietyCount}种）
              </Tag>
            </div>
            <Divider style={{ margin: '2px 0', borderColor: '#f0f0f0' }} />

            {/* All crop types */}
            {(Object.keys(CROP_LABEL) as CropType[]).map(crop => {
              const amt = houseCrops ? (houseCrops[crop] ?? 0) : (crop === 'rice' ? houseFood : 0)
              const barColor2 = amt <= 1 ? '#ff4d4f' : amt < 5 ? '#faad14' : '#52c41a'
              const isMain = crop === 'rice'
              return (
                <div key={crop}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMain ? 3 : 0 }}>
                    <Typography.Text style={{ fontSize: 12, opacity: amt > 0.1 ? 1 : 0.4 }}>{CROP_LABEL[crop]}</Typography.Text>
                    <Space size={3}>
                      <Typography.Text strong style={{ color: amt > 0.1 ? barColor2 : undefined, fontSize: 12 }}>{amt.toFixed(1)}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>担</Typography.Text>
                    </Space>
                  </div>
                  {isMain && amt > 0 && (
                    <div className="food-bar-bg">
                      <div className="food-bar-fill" style={{ width: `${Math.min(100,(amt/30)*100)}%`, background: barColor2 }} />
                    </div>
                  )}
                </div>
              )
            })}
            {houseFood <= 1 && (
              <Alert type="warning" showIcon message="粮食告急！" style={{ padding: '2px 8px', fontSize: 12, marginTop: 4 }} />
            )}
          </Space>
        </Card>
      )}

      {/* ── House: resident list ── */}
      {isHouse && (
        <Card
          size="small"
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{b.type === 'manor' ? '🏯 宅邸住户' : '🏠 住户列表'}</span>
              {residents.length > 0 && (
                <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 400 }}>
                  点击查看详情
                </Typography.Text>
              )}
            </div>
          }
          style={{ borderRadius: 8 }}
          styles={{ body: { padding: residents.length === 0 ? '8px' : '4px 0' } }}
        >
          {residents.length === 0
            ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>暂无住户</Typography.Text>
            : residents.map(c => {
                const profLabel = c.profession
                  ? (JOB_REGISTRY[c.profession]?.label ?? c.profession)
                  : c.workplaceId
                    ? (BUILDING_LABEL[state.buildings.find(b => b.id === c.workplaceId)?.type ?? ''] ?? '工坊') + '工'
                    : '待业'
                const cTier = c.residentTier
                const tierTag = cTier === 'gentry'
                  ? <Tag color="gold" style={{ fontSize: 10, padding: '0 4px' }}>贵族</Tag>
                  : cTier === 'servant'
                    ? <Tag color="blue" style={{ fontSize: 10, padding: '0 4px' }}>仆役</Tag>
                    : null
                const cSatColor = c.satisfaction >= 70 ? '#52c41a' : c.satisfaction >= 40 ? '#faad14' : '#ff4d4f'
                return (
                  <div key={c.id} className="info-panel-citizen-row"
                    onClick={() => selectCitizen(c.id)}>
                    <Space size={4}>
                      <UserOutlined style={{ color: '#888' }} />
                      <div>
                        <Typography.Text strong style={{ fontSize: 13 }}>{c.name}</Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>{c.age}岁 · {profLabel}</Typography.Text>
                      </div>
                    </Space>
                    <Space size={3}>
                      {tierTag}
                      {c.isSick && <Tag color="error" style={{ fontSize: 10, padding: '0 4px' }}>病</Tag>}
                      <Tag color={c.isAtHome ? 'default' : 'processing'} style={{ fontSize: 10, padding: '0 4px' }}>
                        {c.isAtHome ? '在家' : '通勤'}
                      </Tag>
                      <Tag style={{ fontSize: 10, padding: '0 4px', color: cSatColor, borderColor: cSatColor }}>
                        ★{c.satisfaction}
                      </Tag>
                    </Space>
                  </div>
                )
              })}
        </Card>
      )}

      {/* ── 宅邸专属：贵族/仆役信息 ── */}
      {b.type === 'manor' && residents.length > 0 && (() => {
        const gentryList  = residents.filter(c => c.residentTier === 'gentry')
        const servantList = residents.filter(c => c.residentTier === 'servant')
        const avgGentryS  = gentryList.length > 0
          ? Math.round(gentryList.reduce((s, c) => s + c.satisfaction, 0) / gentryList.length)
          : 0
        return (
          <Card size="small" title="🏯 宅邸内部" style={{ borderRadius: 8, borderColor: '#d4b106', background: '#fffbe6' }}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography.Text style={{ fontSize: 12 }}>🎎 贵族住户</Typography.Text>
                <Space size={4}>
                  <Tag color="gold">{gentryList.length} 人</Tag>
                  {gentryList.length > 0 && (
                    <Tag color={avgGentryS >= 70 ? 'success' : avgGentryS >= 40 ? 'warning' : 'error'}>
                      均安乐 {avgGentryS}
                    </Tag>
                  )}
                </Space>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography.Text style={{ fontSize: 12 }}>👘 丫鬟仆役</Typography.Text>
                <Space size={4}>
                  <Tag color={servantList.length >= 2 ? 'blue' : 'orange'}>
                    {servantList.length} / {b.workerSlots} 人
                  </Tag>
                  {servantList.length < 2 && gentryList.length > 0 && (
                    <Tag color="error" style={{ fontSize: 10 }}>侍从不足</Tag>
                  )}
                </Space>
              </div>
              {servantList.length < 2 && gentryList.length > 0 && (
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  💡 贵族需要至少 2 名仆役服侍，方可满足「侍从服务」需求。
                </Typography.Text>
              )}
            </Space>
          </Card>
        )
      })()}

      {/* ── Non-house: worker list ── */}
      {!isHouse && workers.length > 0 && (
        <Card
          size="small"
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>👷 在岗人员</span>
              <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 400 }}>点击查看详情</Typography.Text>
            </div>
          }
          style={{ borderRadius: 8 }}
          styles={{ body: { padding: '4px 0' } }}
        >
          {workers.map(c => {
            const profLabel = c.profession
              ? (JOB_REGISTRY[c.profession]?.label ?? c.profession)
              : c.workplaceId
                ? (BUILDING_LABEL[state.buildings.find(b => b.id === c.workplaceId)?.type ?? ''] ?? '工坊') + '工'
                : '待业'
            const satColor    = c.satisfaction >= 70 ? '#52c41a' : c.satisfaction >= 40 ? '#faad14' : '#ff4d4f'
            const isPeddlerRole   = peddlerWorkerIds.has(c.id)
            const isOutPeddling   = isPeddlerRole && state.citizens.some(c2 => c2.id === c.id && c2.peddlerState !== null)
            return (
              <div key={c.id} className="info-panel-citizen-row" onClick={() => selectCitizen(c.id)}>
                <Space size={4}>
                  <UserOutlined style={{ color: '#888' }} />
                  <div>
                    <Typography.Text strong style={{ fontSize: 13 }}>{c.name}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                      {c.age}岁 · {profLabel}
                      {isGranary && myOxCarts.length > 0 && ' · 运粮'}
                    </Typography.Text>
                  </div>
                </Space>
                <Space size={3}>
                  <Tag color={c.isSick ? 'error' : 'green'} style={{ fontSize: 10, padding: '0 4px' }}>
                    {c.isSick ? '生病' : '健康'}
                  </Tag>
                  {!c.isAtHome && isGranary && <Tag color="orange" style={{ fontSize: 10, padding: '0 4px' }}>🐂出勤</Tag>}
                  {isMarket && (
                    isPeddlerRole
                      ? <Tag color="purple" style={{ fontSize: 10, padding: '0 4px' }}>
                          🧺行商{isOutPeddling ? ' · 出行中' : ''}
                        </Tag>
                      : <Tag color="cyan" style={{ fontSize: 10, padding: '0 4px' }}>🏪坐贾</Tag>
                  )}
                  <Tag style={{ fontSize: 10, padding: '0 4px', color: satColor, borderColor: satColor }}>
                    ★{c.satisfaction}
                  </Tag>
                </Space>
              </div>
            )
          })}
        </Card>
      )}
      {!isHouse && workers.length === 0 && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>暂无工匠入驻</Typography.Text>
      )}

      {/* Action buttons */}
      <Space size={6}>
        <Button size="small" data-testid="btn-place-road-here"
          onClick={() => (window as any).__TEST_API__?.placeRoad(b.x, b.y)}>
          在此放路
        </Button>
        <Button size="small" danger data-testid="btn-bulldoze-selected"
          onClick={() => (window as any).__TEST_API__?.selectTool('bulldoze')}>
          拆除
        </Button>
      </Space>
    </Space>
  )
}

// ─── Citizen panel ────────────────────────────────────────────────────────────

function CitizenPanel() {
  const { state, selectCitizen, selectBuilding } = useSimulation()
  const c = state.citizens.find(x => x.id === state.selectedCitizenId)
  if (!c) return null

  const house = state.buildings.find(x => x.id === c.houseId)
  const workplace = c.workplaceId ? state.buildings.find(x => x.id === c.workplaceId) : null
  const houseRd   = house?.residentData
  const houseFood = houseRd?.food ?? 0
  const foodPct = Math.min(100, (houseFood / 30) * 100)
  const barColor = houseFood <= 1 ? '#ff4d4f' : houseFood < 5 ? '#faad14' : '#52c41a'

  const thought = (() => {
    if (houseFood <= 0.1) return configData.citizensThoughts.starving
    if (c.isSick) return configData.citizensThoughts.sick
    // 下班顺路买粮中
    if (c.status === 'shopping')   return (configData.citizensThoughts as any).shopping   ?? '家里粮食快见底了，下班顺路去集市买些回来。'
    if (c.status === 'returning')  return (configData.citizensThoughts as any).returning  ?? '货买好了，挑着担子赶紧回家，今晚不会断炊了。'
    // 农夫：田里有积压粮食
    if (c.farmZoneId) {
      const farmZone = state.farmZones.find(z => z.id === c.farmZoneId)
      const pile = farmZone?.piles.find(p => p.zoneId === c.farmZoneId)
      if (pile && pile.age > 20) return '粮食堆在田里，运不出去，白忙活了！盼着粮仓赶紧来人收粮。'
    }
    // 宅邸贵族专属
    if (c.residentTier === 'gentry') {
      if (c.satisfaction < 40) return '家中仆役不足，茶水冷了也无人续，这日子实在难熬。'
      if (c.satisfaction < 65) return '城里缺些雅趣，书院、茶坊都不近，委实无聊。'
      return '家资丰厚，茶香四溢，倒也颇为惬意。'
    }
    // 宅邸仆役专属
    if (c.residentTier === 'servant') return '在宅邸当差，虽然辛苦，好歹衣食不愁。'
    if (!c.workplaceId && !c.farmZoneId) return configData.citizensThoughts.unemployed
    if (c.needs.safety < 0.35) return configData.citizensThoughts.unsafety
    if (c.needs.culture < 0.35) return configData.citizensThoughts.lowCulture
    if (c.needs.food < 0.45) return configData.citizensThoughts.lowFood
    return c.isAtHome ? configData.citizensThoughts.atHomeHappy : configData.citizensThoughts.atWorkFocused
  })()

  const profLabel = c.profession
    ? (JOB_REGISTRY[c.profession]?.label ?? c.profession)
    : c.workplaceId
      ? (BUILDING_LABEL[state.buildings.find(b => b.id === c.workplaceId)?.type ?? ''] ?? '工坊') + '工'
      : '待业'

  // Back button: if we came from a house or manor, go back to it
  const canGoBack = Boolean(house && state.buildings.some(b => b.id === c.houseId && (b.type === 'house' || b.type === 'manor')))

  const tierTag = c.residentTier === 'gentry'
    ? <Tag color="gold" style={{ fontSize: 11 }}>宅邸贵族</Tag>
    : c.residentTier === 'servant'
      ? <Tag color="blue" style={{ fontSize: 11 }}>宅邸仆役</Tag>
      : null

  return (
    <Space direction="vertical" size={10} style={{ width: '100%', paddingBottom: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space size={6}>
          <Typography.Text strong style={{ fontSize: 15, color: 'rgba(240,215,160,1)' }} data-testid="selected-citizen-name">
            {c.name}
          </Typography.Text>
          {tierTag}
          <Tag color={c.isSick ? 'error' : 'success'} style={{ fontSize: 11 }}>
            {c.isSick ? '生病' : '健康'}
          </Tag>
        </Space>
        <Space size={4}>
          {canGoBack && (
            <Button size="small" type="text" icon={<HomeOutlined />} title="返回住宅"
              style={{ color: 'rgba(220,195,145,0.9)' }}
              onClick={() => { selectBuilding(c.houseId); selectCitizen(null) }} />
          )}
          <Button size="small" type="text" icon={<CloseOutlined />}
            style={{ color: 'rgba(220,195,145,0.9)' }}
            onClick={() => selectCitizen(null)} />
        </Space>
      </div>

      {/* Basic info */}
      <Card size="small" style={{ borderRadius: 8 }}>
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Row gutter={8}>
            <Col span={12}><Typography.Text type="secondary" style={{ fontSize: 11 }}>年龄</Typography.Text><div style={{ fontWeight: 600 }}>{c.age} 岁</div></Col>
            <Col span={12}><Typography.Text type="secondary" style={{ fontSize: 11 }}>性别</Typography.Text><div style={{ fontWeight: 600 }}>{GENDER_LABEL[c.gender] ?? c.gender}</div></Col>
          </Row>
          <Row gutter={8}>
            <Col span={12}><Typography.Text type="secondary" style={{ fontSize: 11 }}>职业</Typography.Text><div style={{ fontWeight: 600 }}>{profLabel}</div></Col>
            <Col span={12}><Typography.Text type="secondary" style={{ fontSize: 11 }}>状态</Typography.Text>
              <div style={{ fontWeight: 600, color: c.status === 'shopping' ? '#1677ff' : c.status === 'returning' ? '#52c41a' : undefined }}>
                {STATUS_LABEL[c.status] ?? (c.isAtHome ? '在家' : '通勤中')}
              </div>
            </Col>
          </Row>
          {workplace && (
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>工作场所</Typography.Text>
              <div style={{ fontWeight: 600 }}>{BUILDING_LABEL[workplace.type] ?? workplace.type} ({workplace.x},{workplace.y})</div>
            </div>
          )}
        </Space>
      </Card>

      {/* Farmer complaint: pile stuck */}
      {c.farmZoneId && (() => {
        const farmZone = state.farmZones.find(z => z.id === c.farmZoneId)
        const pile = farmZone?.piles.find(p => p.zoneId === c.farmZoneId)
        if (!pile || pile.age <= 20) return null
        return (
          <Alert
            type="warning" showIcon
            message="粮食无法运出！"
            description={`田间堆积 ${pile.amount.toFixed(1)} 担${pile.cropType === 'rice' ? '稻米' : '粮食'}，无人来运，农田已停产。`}
            style={{ fontSize: 12, borderRadius: 8 }}
          />
        )
      })()}

      {/* Shopping activity card: shows when heading to / returning from market */}
      {(c.status === 'shopping' || c.status === 'returning') && (() => {
        const motion = c.motion
        const targetMarket = motion?.targetId ? state.buildings.find(b => b.id === motion.targetId) : null
        return (
          <Alert
            type={c.status === 'returning' ? 'success' : 'info'}
            showIcon
            message={
              <span style={{ fontSize: 12 }}>
                {c.status === 'shopping'
                  ? `🛒 前往集市${targetMarket ? `（${targetMarket.x}, ${targetMarket.y}）` : ''}买粮`
                  : '🏠 买完粮食，正挑担回家'}
              </span>
            }
            description={
              <span style={{ fontSize: 11 }}>
                家中余粮 <b>{houseFood.toFixed(1)}</b> 担 — 下班顺路补货
              </span>
            }
            style={{ borderRadius: 8 }}
          />
        )
      })()}

      {/* Needs — detailed ladder */}
      <Card size="small" title="需求层次" style={{ borderRadius: 8 }}>
        <Space direction="vertical" size={3} style={{ width: '100%' }}>
          {(() => {
            const hc = house?.residentData?.crops
            const food = houseRd?.food ?? 0
            const savings = houseRd?.savings ?? 0
            const dietVarietyHere = hc ? Object.values(hc).filter(v => v > 0.1).length : 0
            const hasTea = hc ? (hc.tea ?? 0) > 0.1 : false
            const house2 = state.buildings.find(b => b.id === c.houseId)
            const hx = house2?.x ?? 0, hy = house2?.y ?? 0
            const cheb = (bx: number, by: number) => Math.max(Math.abs(bx - hx), Math.abs(by - hy))
            const nearMarket = state.buildings.some(b => b.type === 'market' && cheb(b.x, b.y) <= 10)
            const nearAcademy = dietVarietyHere >= 2 && state.buildings.some(b => (b.type as string) === 'academy' && cheb(b.x, b.y) <= 15)
            const nearEntertainment = state.buildings.some(b =>
              ((b.type as string) === 'tavern' || (b.type as string) === 'teahouse') && cheb(b.x, b.y) <= 8)
            const nearTemple = state.buildings.some(b => (b.type as string) === 'temple' && cheb(b.x, b.y) <= 12)
            const nearCulturalVenue = state.buildings.some(b =>
              ((b.type as string) === 'academy' || (b.type as string) === 'papermill') && cheb(b.x, b.y) <= 15)
            const isGentry = c.residentTier === 'gentry'
            const servantCount = house2 && (house2.type as string) === 'manor'
              ? state.citizens.filter(x => x.houseId === house2.id && x.workplaceId === house2.id).length
              : 0
            const hasJob = Boolean(c.workplaceId || c.farmZoneId)
            const hasRoad = state.roads.some(r =>
              (Math.abs(r.x - hx) === 1 && r.y === hy) ||
              (Math.abs(r.y - hy) === 1 && r.x === hx))
            const needRows: { label: string; met: boolean; tier: number; gentry?: boolean }[] = [
              { tier: 1, label: '🍚 温饱',    met: food >= 2 },
              { tier: 2, label: '🌾 粮足',    met: food >= 8 },
              { tier: 2, label: '🛣 道路通达', met: hasRoad },
              { tier: 3, label: '💼 有业可从', met: hasJob },
              { tier: 3, label: '🍱 饮食多样', met: dietVarietyHere >= 2 },
              { tier: 3, label: '💰 积蓄盈余', met: savings >= 20 },
              { tier: 4, label: '🎨 食多味美', met: dietVarietyHere >= 3 },
              { tier: 4, label: '🏪 市场便利', met: nearMarket },
              { tier: 5, label: '📚 文教兴旺', met: nearAcademy },
              { tier: 5, label: '🎭 娱乐休闲', met: nearEntertainment },
              { tier: 6, label: '🎉 节庆热闹', met: nearEntertainment && nearTemple },
              { tier: 6, label: '📖 书香雅物', met: nearCulturalVenue },
              { tier: 7, label: '👘 侍从服务', met: isGentry && servantCount >= 2, gentry: true },
              { tier: 7, label: '🍜 精馔佳肴', met: isGentry && food >= 20 && hasTea && dietVarietyHere >= 4, gentry: true },
            ]
            const visibleRows = needRows.filter(r => !r.gentry || isGentry)
            return visibleRows.map(({ label, met, tier, gentry }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size={4}>
                  <Tag style={{ fontSize: 9, padding: '0 3px', opacity: 0.7 }}>T{tier}</Tag>
                  <Typography.Text style={{ fontSize: 12, color: gentry ? '#d48806' : undefined }}>{label}</Typography.Text>
                </Space>
                <Tag color={met ? 'success' : 'error'} style={{ fontSize: 10, padding: '0 4px' }}>
                  {met ? '✓ 已满足' : '✗ 未满足'}
                </Tag>
              </div>
            ))
          })()}
        </Space>
      </Card>

      {/* House food */}
      {house && (
        <Card size="small" title="🌾 家中粮食" style={{ borderRadius: 8 }}>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography.Text style={{ fontSize: 12 }}>{CROP_LABEL.rice}</Typography.Text>
              <Typography.Text strong style={{ color: barColor, fontSize: 12 }}>
                {houseFood.toFixed(1)} 担
              </Typography.Text>
            </div>
            <div className="food-bar-bg">
              <div className="food-bar-fill" style={{ width: `${foodPct}%`, background: barColor }} />
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              所住: {house.x}, {house.y}
            </Typography.Text>
          </Space>
        </Card>
      )}

      {/* Thought bubble */}
      <Alert showIcon type={houseFood <= 0.1 || c.isSick ? 'warning' : 'info'}
        message={<span style={{ fontSize: 12 }}>💬 {thought}</span>}
        style={{ padding: '4px 10px', borderRadius: 8 }} />

      {/* Satisfaction → 安乐度 */}
      <div style={{ textAlign: 'center' }}>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>安乐度</Typography.Text>
        <Progress type="circle" percent={c.satisfaction} size={60}
          strokeColor={c.satisfaction >= 70 ? '#52c41a' : c.satisfaction >= 40 ? '#faad14' : '#ff4d4f'} />
        {(() => {
          const hc = house?.residentData?.crops
          const dietCount = hc ? Object.values(hc).filter(v => v > 0.1).length : 0
          const info = dietVarietyInfo(dietCount)
          return (
            <div style={{ marginTop: 4 }}>
              <Tag color={info.color} style={{ fontSize: 11 }}>
                🍽 饮食：{info.label}（{dietCount}种）
              </Tag>
              {dietCount >= 3 && (
                <div style={{ fontSize: 11, color: '#52c41a', marginTop: 2 }}>✨ 饮食多样·安乐加成</div>
              )}
            </div>
          )
        })()}
      </div>
    </Space>
  )
}
