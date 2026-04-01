import React from 'react'
import { Alert, Badge, Button, Card, Col, Collapse, Divider, Modal, Progress, Row, Slider, Space, Tabs, Tag, Tooltip, Typography } from 'antd'
import {
  BankOutlined, BookOutlined, CloseOutlined, DeleteOutlined, ExclamationCircleOutlined,
  ExperimentOutlined, FireOutlined, HomeOutlined, InboxOutlined, MedicineBoxOutlined,
  PauseCircleOutlined, PlayCircleOutlined, ShopOutlined, StarOutlined, TeamOutlined, UserOutlined,
} from '@ant-design/icons'
import { useSimulation, ALL_BUILDING_TYPES, type BuildingType, type Tool, type CropType, type MarketConfig, GRANARY_CAPACITY_PER, MARKET_TOTAL_SLOTS, MARKET_CAP_PER_SHOP, FARM_TOOL_PRICE, TOOL_EFFICIENCY_BONUS, logicalPeddlerPos } from '../state/simulation'
import configData from '../config/buildings-and-citizens.json'

// ─── Constants ───────────────────────────────────────────────────────────────

const BUILDING_LABEL: Record<string, string> = Object.entries(configData.buildings).reduce(
  (acc, [k, v]: [string, any]) => { acc[k] = v.label; return acc },
  {} as Record<string, string>,
)

// 与 simulation.tsx 中 DEAD_SPREAD_RADIUS 对应，仅用于 UI 文案
const DEAD_SPREAD_RADIUS_HUD = 2

const CROP_LABEL: Record<CropType, string> = {
  rice: '🌾 稻米', millet: '🌻 粟米', wheat: '🌿 麦子', soybean: '🫘 黄豆', vegetable: '🥬 蔬菜',
}

const GENDER_LABEL: Record<string, string> = { male: '男', female: '女' }

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

const BUILDING_BUTTONS: Array<{ key: BuildingType; label: string; icon: React.ReactNode; cost: number; desc: string }> = [
  { key: 'house',      label: configData.buildings.house.label,      icon: <HomeOutlined />,  cost: configData.buildings.house.cost,      desc: configData.buildings.house.desc },
  { key: 'market',     label: configData.buildings.market.label,     icon: <ShopOutlined />,  cost: configData.buildings.market.cost,     desc: configData.buildings.market.desc },
  { key: 'granary',    label: configData.buildings.granary.label,    icon: <InboxOutlined />, cost: configData.buildings.granary.cost,    desc: configData.buildings.granary.desc },
  { key: 'mine',       label: configData.buildings.mine.label,       icon: <BankOutlined />,  cost: configData.buildings.mine.cost,       desc: configData.buildings.mine.desc },
  { key: 'blacksmith', label: configData.buildings.blacksmith.label, icon: <FireOutlined />,  cost: configData.buildings.blacksmith.cost, desc: configData.buildings.blacksmith.desc },
]

// ─── Left HUD (controls) ─────────────────────────────────────────────────────

export default function HUD() {
  const { state, start, stop, selectTool, setTaxRates, setSimSpeed } = useSimulation()
  const [taxModalOpen, setTaxModalOpen] = React.useState(false)
  const attempt = state.lastBuildAttempt

  const feedback = React.useMemo(() => {
    if (!attempt) return null
    if (attempt.success) return { type: 'success' as const, message: `建造成功: ${attempt.buildType} @ (${attempt.x}, ${attempt.y})` }
    const reasonMap: Record<string, string> = {
      'no-build-type-selected': '请先选择建造类型。',
      'insufficient-funds': '资金不足，无法建造。',
      'tile-occupied': '格子已被建筑占用。',
      'road-occupied': '格子已有道路，请先推平。',
      'river-occupied': '该处为河流，无法建造。',
      'no-ore-vein': '此处无铁矿脉，冶铁厂只能建于铁矿脉（山地红色标记）之上。',
    }
    return { type: 'warning' as const, message: `建造失败: ${reasonMap[attempt.reason] ?? attempt.reason}` }
  }, [attempt])

  const hour = Math.floor(state.dayTime * 24)
  const isNight = state.dayTime < 0.25 || state.dayTime > 0.75
  const farmTotal   = Object.values(state.farmInventory).reduce((s, v) => s + v, 0)
  const granaryTotal = Object.values(state.granaryInventory).reduce((s, v) => s + v, 0)
  const marketTotal  = Object.values(state.marketInventory).reduce((s, v) => s + v, 0)

  const isShopDay = state.dayCount % 10 === 0
  const nextShopIn = 10 - (state.dayCount % 10)

  return (
    <>
      {/* ── Left control panel ────────────────────── */}
      <div className="hud">
        <Card className="hud-card" size="small" variant="plain">
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {/* Title */}
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Typography.Title level={5} style={{ margin: 0 }}>🏯 清明上河图</Typography.Title>
              <Space size={6}>
                <Tag color="blue">帧 {state.tick + 1}</Tag>
                <Tag color={state.running ? 'green' : 'default'}>{state.running ? '运行中' : '已暂停'}</Tag>
              </Space>
            </Space>

            {/* Time */}
            <Card size="small" style={{ background: isNight ? '#1a2040' : '#fffbe6', borderColor: isNight ? '#3a4a80' : '#ffe58f' }}>
              <Space>
                <span style={{ fontSize: 18 }}>{isNight ? '🌙' : hour < 8 ? '🌅' : hour < 17 ? '☀️' : '🌆'}</span>
                <div>
                  <Typography.Text style={{ color: isNight ? '#aac' : '#333', fontWeight: 600 }}>
                    第 {state.dayCount} 天 · {dayTimeLabel(state.dayTime)}
                  </Typography.Text>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                    {dayPhaseTag(state.dayTime)}
                    {isShopDay
                      ? <Tag color="gold">🛍 旬休采购日</Tag>
                      : <Tag color="default" style={{ fontSize: 10 }}>旬休还剩 {nextShopIn} 天</Tag>}
                  </div>
                </div>
              </Space>
            </Card>

            {/* Stats */}
            <Row gutter={6}>
              <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><Typography.Text type="secondary" style={{ fontSize: 11 }}>月份</Typography.Text><div style={{ fontWeight: 700 }}>{state.month}</div></Card></Col>
              <Col span={8}>
                <Tooltip title={
                  <div>
                    <div>点击调整赋税课率</div>
                    {state.monthlyConstructionCost > 0 &&
                      <div style={{ marginTop: 4, color: '#ffccc7' }}>🏗 本月已建造：¥{state.monthlyConstructionCost}</div>}
                  </div>
                }>
                  <Card size="small" style={{ textAlign: 'center', cursor: 'pointer', borderColor: '#d4b106' }}
                    onClick={() => setTaxModalOpen(true)}>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>财帛 💰</Typography.Text>
                    <div style={{ fontWeight: 700 }}>¥{state.money.toFixed(2)}</div>
                  </Card>
                </Tooltip>
              </Col>
              <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><Typography.Text type="secondary" style={{ fontSize: 11 }}>户口</Typography.Text><div style={{ fontWeight: 700 }}>{state.population}</div></Card></Col>
            </Row>
            <Row gutter={6}>
              <Col span={8}>
                <Tooltip title={`丁税¥${state.lastTaxBreakdown.ding} · 田赋¥${state.lastTaxBreakdown.tian} · 市税¥${state.lastTaxBreakdown.shang} · 养民-¥${state.lastMonthlyExpenseBreakdown.total}`}>
                  <Card size="small" style={{ textAlign: 'center', cursor: 'help' }}>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>上月收益</Typography.Text>
                    <div style={{ color: (state.lastMonthlyTax - state.lastMonthlyExpenseBreakdown.total) >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>
                      {(state.lastMonthlyTax - state.lastMonthlyExpenseBreakdown.total) >= 0 ? '+' : ''}
                      {state.lastMonthlyTax - state.lastMonthlyExpenseBreakdown.total}
                    </div>
                  </Card>
                </Tooltip>
              </Col>
              <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><Typography.Text type="secondary" style={{ fontSize: 11 }}>民心</Typography.Text><div>{state.avgSatisfaction}%</div></Card></Col>
              <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><Typography.Text type="secondary" style={{ fontSize: 11 }}>通勤</Typography.Text><div><Badge count={state.walkers.length} showZero color="blue" size="small" /> <TeamOutlined /></div></Card></Col>
            </Row>

            {/* Need pressure + supply */}
            <Space wrap size={4}>
              <Tag color="orange">🍚 粮食压力 {state.needPressure.food}%</Tag>
              <Tag color={state.needPressure.safety > 45 ? 'error' : 'green'}>🛡 治安 {state.needPressure.safety}%</Tag>
              <Tag color={state.needPressure.culture > 45 ? 'warning' : 'green'}>📚 文化 {state.needPressure.culture}%</Tag>
              <Tag color="green">🌾 田间 {farmTotal.toFixed(1)}</Tag>
              <Tag color="gold">🏚 粮仓 {granaryTotal.toFixed(1)}</Tag>
              <Tag color="blue">🛍 集市 {marketTotal.toFixed(1)}</Tag>
              {state.farmPiles.length > 0 && <Tag color="lime">📦 堆积 {state.farmPiles.length}</Tag>}
              {state.oxCarts.length > 0 && <Tag color="orange">🐂 牛车 {state.oxCarts.length}</Tag>}
              {state.marketBuyers.length > 0 && <Tag color="purple">🧺 行商 {state.marketBuyers.length}</Tag>}
              {state.migrants.length > 0 && <Tag color="processing">🐴 入城 {state.migrants.length}</Tag>}
            </Space>

            {/* Start / Stop + speed control */}
            <Space.Compact block>
              {state.running
                ? <Button icon={<PauseCircleOutlined />} onClick={stop} style={{ flex: 2 }}>停止</Button>
                : <Button type="primary" icon={<PlayCircleOutlined />} onClick={start} style={{ flex: 2 }}>开始</Button>}
              {([0.25, 1, 2] as const).map(s => (
                <Button key={s} size="middle"
                  type={state.simSpeed === s ? 'primary' : 'default'}
                  onClick={() => setSimSpeed(s)}
                  title={s === 0.25 ? '慢放（¼速）' : s === 1 ? '正常速度' : '快进（2倍）'}
                  style={{ flex: 1, fontSize: 12 }}>
                  {s === 0.25 ? '慢' : s === 1 ? '×1' : '×2'}
                </Button>
              ))}
            </Space.Compact>

            <Divider style={{ margin: '4px 0' }}>工具</Divider>

            {/* Core tools */}
            <Space.Compact block>
              {(['pan', 'road', 'farmZone', 'bulldoze'] as Tool[]).map(t => (
                <Button key={t} type={state.selectedTool === t ? 'primary' : 'default'}
                  icon={t === 'bulldoze' ? <DeleteOutlined /> : undefined}
                  onClick={() => selectTool(t)} style={{ flex: 1 }}>
                  {t === 'pan' ? '浏览' : t === 'road' ? '道路' : t === 'farmZone' ? '农地' : '拆除'}
                </Button>
              ))}
            </Space.Compact>
            {state.selectedTool === 'road' && (
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                🌉 跨河建桥：¥80×跨度（第1格¥80，第2格¥160…）
              </Typography.Text>
            )}

            {/* Building palette */}
            <Collapse size="small" defaultActiveKey={['buildings']} items={[{
              key: 'buildings',
              label: '建筑',
              children: (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {BUILDING_BUTTONS.map(b => (
                    <Button key={b.key} size="small" icon={b.icon}
                      type={state.selectedTool === b.key ? 'primary' : 'default'}
                      onClick={() => selectTool(b.key)}
                      title={`${b.desc}（¥${b.cost}）`}
                      style={{ textAlign: 'left' }}>
                      {b.label} <Typography.Text type="secondary" style={{ fontSize: 10 }}>¥{b.cost}</Typography.Text>
                    </Button>
                  ))}
                </div>
              ),
            }]} />

            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              Pan: 左键平移 / 右键旋转。农地模式下绿圈标示可垦荒地（河流五步之内，非山地）。冶铁厂须建于山地铁矿脉上。
            </Typography.Text>

            {feedback && <Alert showIcon type={feedback.type} message={feedback.message} style={{ padding: '4px 8px' }} />}

            {/* 上奏 */}
            <AdvicePanel />
          </Space>
        </Card>
      </div>

      {/* ── Tax rate modal ────────────────────────── */}
      <TaxModal open={taxModalOpen} onClose={() => setTaxModalOpen(false)} setTaxRates={setTaxRates} />

      {/* ── Right info panel ──────────────────────── */}
      <InfoPanel />

      {/* ── Debug overlay (top-right) ─────────────── */}
      <DebugOverlay />
    </>
  )
}

// ─── 上奏（城市建议面板）─────────────────────────────────────────────────────

type AdviceItem = { severity: 'error' | 'warning' | 'info'; icon: string; title: string; body: string }

function computeAdvice(state: ReturnType<typeof useSimulation>['state']): AdviceItem[] {
  const items: AdviceItem[] = []
  const pop = state.citizens.length

  // 1. 饥荒 ──────────────────────────────────────────────────────────────────
  const starvingCount = state.citizens.filter(c => (state.houseFood[c.houseId] ?? 0) < 2).length
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
    const deadHouses = Object.values(state.houseDead ?? {}).filter(v => v > 0).length
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
  const mktTotal = Object.values(state.marketInventory).reduce((a, v) => a + v, 0)
  const granaryTotal = Object.values(state.granaryInventory).reduce((a, v) => a + v, 0)
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

  return items.sort((a, b) => {
    const rank = { error: 0, warning: 1, info: 2 }
    return rank[a.severity] - rank[b.severity]
  })
}

function AdvicePanel() {
  const { state } = useSimulation()
  const advice = React.useMemo(() => computeAdvice(state), [
    state.citizens, state.houseFood, state.buildings, state.roads,
    state.marketInventory, state.granaryInventory, state.taxRates, state.houseDead,
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
    <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
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

// ─── Right info panel ─────────────────────────────────────────────────────────

function InfoPanel() {
  const { state } = useSimulation()
  const hasSelection = Boolean(state.selectedBuildingId || state.selectedCitizenId || state.selectedFarmZoneId)
  if (!hasSelection) return null

  return (
    <div className="info-panel">
      <div style={{ padding: '12px 12px 0' }}>
        {state.selectedCitizenId
          ? <CitizenPanel />
          : state.selectedFarmZoneId
            ? <FarmZonePanel />
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
  const pendingPile = state.farmPiles.find(p => p.zoneId === zone.id)
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

  // Crop label without emoji for buttons
  const CROP_BTN: Record<CropType, string> = {
    rice: '🌾 稻米', millet: '🌻 粟米', wheat: '🌿 麦子', soybean: '🫘 黄豆', vegetable: '🥬 蔬菜',
  }

  return (
    <Space direction="vertical" size={10} style={{ width: '100%', paddingBottom: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space size={6}>
          <Typography.Text strong style={{ fontSize: 15 }}>🌾 农田</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>({zone.x}~{zone.x+1}, {zone.y}~{zone.y+1})</Typography.Text>
        </Space>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => selectFarmZone(null)} />
      </div>

      {/* Road access warning */}
      {!hasRoadAccess && (
        <Alert
          type="warning" showIcon
          message="未与道路相连"
          description="农田需要紧邻道路，农夫才能前来耕作，牛车才能运走粮食。"
          style={{ fontSize: 12, borderRadius: 8 }}
        />
      )}

      {/* Blocked production alert */}
      {isBlocked && (
        <Alert
          type="error" showIcon
          message={`🚫 粮食堆积，生产已停滞（${pendingPile!.amount.toFixed(1)} 担）`}
          description={blockReason ?? ''}
          style={{ fontSize: 12, borderRadius: 8 }}
        />
      )}

      {/* Crop selector */}
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

      {/* Crop growth progress */}
      <Card size="small" title="📈 作物生长" style={{ borderRadius: 8 }}>
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography.Text style={{ fontSize: 12 }}>{CROP_BTN[zone.cropType]}</Typography.Text>
            <Space size={4}>
              {zone.growthProgress >= 0.95
                ? <Tag color="gold" style={{ fontSize: 11 }}>可收获！</Tag>
                : zone.growthProgress >= 0.70
                  ? <Tag color="processing" style={{ fontSize: 11 }}>即将成熟</Tag>
                  : zone.growthProgress >= 0.35
                    ? <Tag color="green" style={{ fontSize: 11 }}>生长中</Tag>
                    : zone.growthProgress >= 0.08
                      ? <Tag color="lime" style={{ fontSize: 11 }}>幼苗期</Tag>
                      : <Tag style={{ fontSize: 11 }}>播种中</Tag>}
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
              : '#52c41a'
            }
          />
          {zone.pendingCropType && zone.pendingCropType !== zone.cropType ? (
            <Typography.Text style={{ fontSize: 11, color: '#fa8c16' }}>
              ⏳ 收获后自动切换 → {CROP_BTN[zone.pendingCropType]}
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              每5游戏日收获约 {(15 * 0.7).toFixed(0)}~15 担·自动转入粮仓
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
        bodyStyle={{ padding: assignedFarmers.length === 0 ? '8px' : '4px 0' }}
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
        const cityToolStock = state.smithInventory
        // 判断此田的农夫是否持有铁器
        const farmerHasTools = assignedFarmers.some(c => (state.houseTools[c.houseId] ?? 0) > 0)
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

              {/* 农具明细 */}
              {assignedFarmers.length > 0 && (
                <div style={{ background: '#fafafa', borderRadius: 6, padding: '4px 8px' }}>
                  {assignedFarmers.map(c => {
                    const toolCount = state.houseTools[c.houseId] ?? 0
                    return (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', fontSize: 12 }}>
                        <Typography.Text style={{ fontSize: 12 }}>{c.name}</Typography.Text>
                        {toolCount > 0
                          ? <Tag color="green" style={{ fontSize: 10 }}>持有铁器 ×{toolCount}</Tag>
                          : <Tag color="default" style={{ fontSize: 10 }}>尚未购置</Tag>}
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
            const amt = state.farmInventory[crop]
            const isActive = zone.cropType === crop
            return (
              <div key={crop} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: isActive ? 1 : 0.38 }}>
                <Typography.Text style={{ fontSize: 12 }}>{CROP_BTN[crop]}</Typography.Text>
                <Space size={2}>
                  <Typography.Text strong style={{ fontSize: 12, color: isActive ? '#52c41a' : undefined }}>{amt.toFixed(1)}</Typography.Text>
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

// ─── Building panel ───────────────────────────────────────────────────────────

function BuildingPanel() {
  const { state, selectBuilding, selectCitizen, setMarketConfig } = useSimulation()
  const b = state.buildings.find(x => x.id === state.selectedBuildingId)
  if (!b) return null

  const isHouse    = b.type === 'house'
  const isMarket   = b.type === 'market'
  const isGranary  = b.type === 'granary'
  const isBlacksmith = b.type === 'blacksmith'
  const isMine     = b.type === 'mine'
  const residents  = isHouse ? state.citizens.filter(c => c.houseId === b.id) : []
  const workers    = !isHouse ? state.citizens.filter(c => c.workplaceId === b.id) : []
  const houseFood  = state.houseFood[b.id] ?? 0
  const houseSavings = state.houseSavings[b.id] ?? 0
  const houseCrops   = state.houseCrops[b.id]
  const dietVarietyCount = houseCrops ? Object.values(houseCrops).filter(v => v > 0.1).length : 0

  const mines            = state.buildings.filter(b2 => b2.type === 'mine')
  const smithBuildings   = state.buildings.filter(b2 => b2.type === 'blacksmith')
  const mineCapacity     = mines.length * 60
  const smithCapacity    = smithBuildings.length * 20
  const mineOreFillPct   = mineCapacity   > 0 ? Math.min(100, (state.mineInventory  / mineCapacity)  * 100) : 0
  const smithToolFillPct = smithCapacity  > 0 ? Math.min(100, (state.smithInventory / smithCapacity) * 100) : 0
  const granaries       = state.buildings.filter(b2 => b2.type === 'granary')
  const granaryCapacity = granaries.length * GRANARY_CAPACITY_PER
  const granaryTotal    = Object.values(state.granaryInventory).reduce((s, v) => s + v, 0)
  const granaryFillPct  = granaryCapacity > 0 ? Math.min(100, (granaryTotal / granaryCapacity) * 100) : 0
  const myOxCarts       = state.oxCarts.filter(c => c.granaryId === b.id)

  // 集市容量 = 坐贾数 × MARKET_CAP_PER_SHOP
  const markets          = state.buildings.filter(b2 => b2.type === 'market')
  const marketCfg: MarketConfig = state.marketConfig[b.id] ?? { shopkeepers: 4, peddlers: 2 }
  const marketCapacity   = markets.reduce((sum, m) => {
    const cfg = state.marketConfig[m.id] ?? { shopkeepers: 4, peddlers: 2 }
    return sum + cfg.shopkeepers * MARKET_CAP_PER_SHOP
  }, 0)
  const marketTotal      = Object.values(state.marketInventory).reduce((s, v) => s + v, 0)
  const marketFillPct    = marketCapacity > 0 ? Math.min(100, (marketTotal / marketCapacity) * 100) : 0
  const myMarketBuyers   = state.marketBuyers.filter(mb => mb.marketId === b.id)
  const myPeddlers       = state.peddlers.filter(p => p.marketId === b.id)


  const hasRoadAccess = state.roads.some(r =>
    Math.abs(r.x - b.x) + Math.abs(r.y - b.y) === 1
  )

  const CROP_NAME: Record<CropType, string> = { rice: '稻米', millet: '粟米', wheat: '麦子', soybean: '黄豆', vegetable: '蔬菜' }

  return (
    <Space direction="vertical" size={10} style={{ width: '100%', paddingBottom: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space size={6}>
          <Typography.Text strong style={{ fontSize: 15 }}>
            {BUILDING_LABEL[b.type] ?? b.type}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>({b.x}, {b.y})</Typography.Text>
        </Space>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => selectBuilding(null)} />
      </div>

      {/* Tags */}
      <Space size={6} wrap>
        <Tag>造价 ¥{b.cost}</Tag>
        {isHouse
          ? <Tag color="blue">住户 {residents.length}/{b.capacity}</Tag>
          : <Tag color="purple">仓丁 {workers.length}/{b.workerSlots}</Tag>}
        {isHouse && <Tag color="gold">💰 积蓄 ¥{houseSavings.toFixed(2)}</Tag>}
        {isHouse && dietVarietyCount > 0 && (
          <Tag color={dietVarietyInfo(dietVarietyCount).color}>
            🍽 {dietVarietyInfo(dietVarietyCount).label}（{dietVarietyCount}种）
          </Tag>
        )}
        <span data-testid="selected-building-label" style={{ display: 'none' }}>{BUILDING_LABEL[b.type]}</span>
        {isHouse && <span data-testid="selected-building-type" style={{ display: 'none' }}>Type: house</span>}
      </Space>

      {!hasRoadAccess && (
        <Alert type="warning" showIcon message="未与道路相连"
          description="此建筑尚未接通道路，居民无法通勤，迁入率和满意度将受影响。"
          style={{ fontSize: 12, borderRadius: 8 }} />
      )}

      {/* ── 疫病警示 ── */}
      {isHouse && (() => {
        const sickCount = residents.filter(c => c.isSick).length
        const deadCount = state.houseDead?.[b.id] ?? 0
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
                全城合计：<b>{granaryTotal.toFixed(1)}</b> / {granaryCapacity} 担
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
              const amt = state.granaryInventory[crop]
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

      {/* ── 矿山：铁矿石库存 ── */}
      {isMine && (
        <Card size="small" title="⛏ 铁矿石存量" style={{ borderRadius: 8 }}>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography.Text style={{ fontSize: 12 }}>
                全城存矿：<b>{state.mineInventory.toFixed(1)}</b> / {mineCapacity} 担
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
            {workers.length === 0 && (
              <MineNoWorkerHint />
            )}
          </Space>
        </Card>
      )}

      {/* ── 铁匠铺：农具库存 ── */}
      {isBlacksmith && (
        <Card size="small" title="🔨 铁制农具存量" style={{ borderRadius: 8 }}>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography.Text style={{ fontSize: 12 }}>
                全城存货：<b>{state.smithInventory}</b> / {smithCapacity} 件
              </Typography.Text>
              <Tag color={smithToolFillPct >= 90 ? 'error' : state.smithInventory > 0 ? 'success' : 'default'}>
                {state.smithInventory > 0 ? `${smithToolFillPct.toFixed(0)}% 充盈` : '无存货'}
              </Tag>
            </div>
            <Progress percent={smithToolFillPct} size="small" showInfo={false}
              strokeColor={state.smithInventory > 0 ? '#52c41a' : '#d9d9d9'} />
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
              <div>⛏ 当前矿石库存：{state.mineInventory.toFixed(1)}担
                {state.mineInventory < 2 && <Tag color="error" style={{ marginLeft: 6, fontSize: 10 }}>矿石不足</Tag>}
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
                    const amt = state.marketInventory[crop]
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
              label: <span>🔧 农具 <Tag color={state.smithInventory > 0 ? 'green' : 'default'} style={{ fontSize: 10 }}>{state.smithInventory}件</Tag></span>,
              children: (() => {
                const smithWorkerCount = smithBuildings.reduce((n, sb) =>
                  n + state.citizens.filter(c => c.workplaceId === sb.id && !c.isSick).length, 0)
                return (
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography.Text style={{ fontSize: 12 }}>
                        货架：<b>{state.smithInventory}</b> / {smithCapacity} 件
                      </Typography.Text>
                      <Tag color={smithToolFillPct >= 90 ? 'error' : state.smithInventory > 0 ? 'success' : 'default'}>
                        {state.smithInventory > 0 ? `${smithToolFillPct.toFixed(0)}% 充盈` : '无存货'}
                      </Tag>
                    </div>
                    <Progress percent={smithToolFillPct} size="small" showInfo={false}
                      strokeColor={state.smithInventory > 0 ? '#52c41a' : '#d9d9d9'} />
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
                      <div>🔨 铁匠铺在岗：{smithWorkerCount} 人 · ⛏ 矿石：{state.mineInventory.toFixed(1)} 担
                        {state.mineInventory < 2 && <Tag color="error" style={{ marginLeft: 6, fontSize: 10 }}>矿石不足</Tag>}
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
                    const granaryB = state.buildings.find(g => g.id === mb.granaryId)
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
              <span>🏠 住户列表</span>
              {residents.length > 0 && (
                <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 400 }}>
                  点击查看详情
                </Typography.Text>
              )}
            </div>
          }
          style={{ borderRadius: 8 }}
          bodyStyle={{ padding: residents.length === 0 ? '8px' : '4px 0' }}
        >
          {residents.length === 0
            ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>暂无住户</Typography.Text>
            : residents.map(c => {
                const profLabel = c.profession
                  ? (configData.professions as any)[c.profession]?.label ?? c.profession
                  : '待业'
                const satColor = c.satisfaction >= 70 ? '#52c41a' : c.satisfaction >= 40 ? '#faad14' : '#ff4d4f'
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
                      {c.isSick && <Tag color="error" style={{ fontSize: 10, padding: '0 4px' }}>病</Tag>}
                      <Tag color={c.isAtHome ? 'default' : 'processing'} style={{ fontSize: 10, padding: '0 4px' }}>
                        {c.isAtHome ? '在家' : '通勤'}
                      </Tag>
                      <Tag style={{ fontSize: 10, padding: '0 4px', color: satColor, borderColor: satColor }}>
                        ★{c.satisfaction}
                      </Tag>
                    </Space>
                  </div>
                )
              })}
        </Card>
      )}

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
          bodyStyle={{ padding: '4px 0' }}
        >
          {workers.map(c => {
            const profLabel = c.profession
              ? (configData.professions as any)[c.profession]?.label ?? c.profession
              : '待业'
            const satColor = c.satisfaction >= 70 ? '#52c41a' : c.satisfaction >= 40 ? '#faad14' : '#ff4d4f'
            return (
              <div key={c.id} className="info-panel-citizen-row" onClick={() => selectCitizen(c.id)}>
                <Space size={4}>
                  <UserOutlined style={{ color: '#888' }} />
                  <div>
                    <Typography.Text strong style={{ fontSize: 13 }}>{c.name}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                      {c.age}岁 · {profLabel}
                      {isGranary && myOxCarts.length > 0 && ' · 运粮'}
                      {isMarket  && myMarketBuyers.length > 0 && ' · 补货'}
                    </Typography.Text>
                  </div>
                </Space>
                <Space size={3}>
                  <Tag color={c.isSick ? 'error' : 'green'} style={{ fontSize: 10, padding: '0 4px' }}>
                    {c.isSick ? '生病' : '健康'}
                  </Tag>
                  {!c.isAtHome && isGranary && <Tag color="orange" style={{ fontSize: 10, padding: '0 4px' }}>🐂出勤</Tag>}
                  {!c.isAtHome && isMarket  && <Tag color="purple" style={{ fontSize: 10, padding: '0 4px' }}>🛺出勤</Tag>}
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
  const houseFood = state.houseFood[c.houseId] ?? 0
  const foodPct = Math.min(100, (houseFood / 30) * 100)
  const barColor = houseFood <= 1 ? '#ff4d4f' : houseFood < 5 ? '#faad14' : '#52c41a'

  const thought = (() => {
    if (houseFood <= 0.1) return configData.citizensThoughts.starving
    if (c.isSick) return configData.citizensThoughts.sick
    // 农夫：田里有积压粮食
    if (c.farmZoneId) {
      const pile = state.farmPiles.find(p => p.zoneId === c.farmZoneId)
      if (pile && pile.age > 20) return '粮食堆在田里，运不出去，白忙活了！盼着粮仓赶紧来人收粮。'
    }
    if (!c.workplaceId && !c.farmZoneId) return configData.citizensThoughts.unemployed
    if (c.needs.safety < 0.35) return configData.citizensThoughts.unsafety
    if (c.needs.culture < 0.35) return configData.citizensThoughts.lowCulture
    if (c.needs.food < 0.45) return configData.citizensThoughts.lowFood
    return c.isAtHome ? configData.citizensThoughts.atHomeHappy : configData.citizensThoughts.atWorkFocused
  })()

  const profLabel = c.profession
    ? (configData.professions as any)[c.profession]?.label ?? c.profession
    : '待业'

  // Back button: if we came from a house, go back to it
  const canGoBack = Boolean(house && state.buildings.some(b => b.id === c.houseId && b.type === 'house'))

  return (
    <Space direction="vertical" size={10} style={{ width: '100%', paddingBottom: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space size={6}>
          <Typography.Text strong style={{ fontSize: 15 }} data-testid="selected-citizen-name">
            {c.name}
          </Typography.Text>
          <Tag color={c.isSick ? 'error' : 'success'} style={{ fontSize: 11 }}>
            {c.isSick ? '生病' : '健康'}
          </Tag>
        </Space>
        <Space size={4}>
          {canGoBack && (
            <Button size="small" type="text" icon={<HomeOutlined />} title="返回住宅"
              onClick={() => { selectBuilding(c.houseId); selectCitizen(null) }} />
          )}
          <Button size="small" type="text" icon={<CloseOutlined />}
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
            <Col span={12}><Typography.Text type="secondary" style={{ fontSize: 11 }}>状态</Typography.Text><div style={{ fontWeight: 600 }}>{c.isAtHome ? '在家' : '通勤中'}</div></Col>
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
        const pile = state.farmPiles.find(p => p.zoneId === c.farmZoneId)
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

      {/* Needs */}
      <Card size="small" title="民生需求" style={{ borderRadius: 8 }}>
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          {[
            { label: '🍚 衣食充裕', val: c.needs.food },
            { label: '🛡 太平安定', val: c.needs.safety },
            { label: '📚 文风蔚盛', val: c.needs.culture },
          ].map(({ label, val }) => (
            <div key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <Typography.Text style={{ fontSize: 12 }}>{label}</Typography.Text>
                <Typography.Text style={{ fontSize: 12 }}>{Math.round(val * 100)}%</Typography.Text>
              </div>
              <Progress percent={Math.round(val * 100)} size="small" showInfo={false}
                strokeColor={val < 0.4 ? '#ff4d4f' : val < 0.65 ? '#faad14' : '#52c41a'} />
            </div>
          ))}
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
          const hc = state.houseCrops[c.houseId]
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
