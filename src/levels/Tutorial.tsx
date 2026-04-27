/**
 * Tutorial — step-by-step guided overlay for Level 1.
 */
import React from 'react'
import * as THREE from 'three'
import { useSimulation, ENTRY_TILE, logicalMigrantPos } from '../state/simulation'

// ─── Connectivity helper ──────────────────────────────────────────────────────

/** BFS from entry tile through roads; returns true if any house footprint is adjacent. */
function housesReachableFromEntry(
  roads: { x: number; y: number }[],
  houses: { x: number; y: number; w?: number; h?: number }[],
): boolean {
  if (houses.length === 0) return true
  const roadSet = new Set(roads.map(r => `${r.x},${r.y}`))
  const entry = ENTRY_TILE
  if (!roadSet.has(`${entry.x},${entry.y}`)) return false

  function adjacentToHouse(rx: number, ry: number): boolean {
    return houses.some(h => {
      const bw = h.w ?? 1, bh = h.h ?? 1
      for (let dx = 0; dx < bw; dx++)
        for (let dy = 0; dy < bh; dy++)
          if (Math.abs(rx - (h.x + dx)) + Math.abs(ry - (h.y + dy)) === 1) return true
      return false
    })
  }

  const visited = new Set<string>([`${entry.x},${entry.y}`])
  const queue: { x: number; y: number }[] = [{ x: entry.x, y: entry.y }]
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (adjacentToHouse(cur.x, cur.y)) return true
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
      const nx = cur.x + dx, ny = cur.y + dy
      const key = `${nx},${ny}`
      if (!visited.has(key) && roadSet.has(key)) { visited.add(key); queue.push({ x: nx, y: ny }) }
    }
  }
  return false
}

// ─── Step definitions ─────────────────────────────────────────────────────────

type StepId =
  | 'pan-intro' | 'pan-drag' | 'pan-rotate' | 'pan-zoom'
  | 'house-open' | 'house-select' | 'house-road'
  | 'start' | 'speed-up'
  | 'waiting-resident' | 'house-entry-road' | 'waiting-resident-2'
  | 'resident-settle' | 'resident-inspect'
  | 'done'

// ─── Commented-out future steps ───────────────────────────────────────────────
// | 'farmzone-select' | 'farmzone-place'
// | 'connect-road'
// | 'granary-open' | 'granary-select'
// | 'market-open' | 'market-select'

interface TutStep {
  id: StepId
  emoji: string
  title: string
  /** Desktop body text */
  body: string
  /** Mobile/touch body text — falls back to body if not set */
  bodyTouch?: string
  targetId?: string
  fallbackTargetId?: string
  manual?: boolean
  hideSpotlight?: (
    s: ReturnType<typeof useSimulation>['state'],
    usingFallback: boolean,
  ) => boolean
}

const STEPS: TutStep[] = [
  {
    id: 'pan-intro', emoji: '🗺', title: '浏览模式', manual: true, targetId: 'pan-tool',
    body:      '进入游戏后默认处于【浏览】模式（底部工具栏已高亮）。\n接下来带你练习三种地图操作，完成后再开始建城。',
    bodyTouch: '进入游戏后默认处于【浏览】模式（底部工具栏已高亮）。\n接下来带你练习三种触控操作，完成后再开始建城。',
  },
  {
    id: 'pan-drag', emoji: '👈', title: '平移视角',
    body:      '在地图上 按住鼠标左键并拖动，视角将随之平移。\n试着移动到你想要建城的位置。',
    bodyTouch: '用 单指 在地图上拖动，视角将随之平移。\n试着移动到你想要建城的位置。',
  },
  {
    id: 'pan-rotate', emoji: '🖱', title: '旋转视角',
    body:      '在地图上 按住鼠标右键并拖动，可以旋转视角。\n试着转一转，感受地形的立体感。',
    bodyTouch: '用 双指旋转 可以旋转视角。\n两根手指放在屏幕上，旋转它们来改变视角方向。',
  },
  {
    id: 'pan-zoom', emoji: '🔍', title: '缩放视角',
    body:      '滚动鼠标滚轮可以放大或缩小视角。\n放大找到心仪的建城之地，准备好后将自动继续。',
    bodyTouch: '用 双指捏合/展开 来缩放视角。\n双指靠拢为缩小，展开为放大。',
  },
  {
    id: 'house-open', emoji: '🏗', title: '第一步：打开建筑面板', targetId: 'building-btn',
    body:      '找好建城之地！点击底部工具栏右侧的【🏗 建筑】按钮，打开建筑选择面板。',
    bodyTouch: '找好建城之地！点击底部工具栏右侧的【🏗 建筑】按钮，打开建筑选择面板。',
  },
  {
    id: 'house-select', emoji: '🏠', title: '第二步：建造民居', targetId: 'house-tool',
    body:      '在【居住】标签中点击【民居】，然后点击道路旁的空地放置。民居是百姓安家之所。',
    bodyTouch: '在【居住】标签中点击【民居】，然后点击道路旁的空地放置。',
    hideSpotlight: (s) => s.selectedTool === 'house',
  },
  {
    id: 'house-road', emoji: '🛤', title: '第二步：将民居连通道路', targetId: 'road-tool',
    body:      '民居须紧邻道路，移民方能循路入城！\n\n选择底部工具栏的【道路】工具，将道路延伸至民居相邻的格子。',
    bodyTouch: '民居须紧邻道路，移民才能入城！\n选择【道路】工具，将道路铺至民居旁边。',
    hideSpotlight: (s) => s.selectedTool === 'road',
  },
  {
    id: 'start', emoji: '▶', title: '第三步：开启时光', targetId: 'start-btn',
    body:      '城已初具，万事俱备！点击顶部的【▶ 开始】按钮，让时间流转，等待移民入城。',
    bodyTouch: '城已初具！点击顶部的【▶ 开始】按钮，让时间流转，等待移民入城。',
  },
  {
    id: 'speed-up', emoji: '⏩', title: '调节时光流速', targetId: 'speed-2x-btn',
    body:      '时间已开始流转！\n\n顶部中央有三个速度按钮：¼× 慢放、1× 正常、2× 快进。\n\n点击【2×】按钮，加快时光流速——让移民更快赶到。',
    bodyTouch: '顶部有速度按钮：¼×慢放 / 1×正常 / 2×快进。\n点击【2×】加速时光。',
    hideSpotlight: (s) => s.simSpeed === 2,
  },
  {
    id: 'waiting-resident', emoji: '⏳', title: '静候移民叩门',
    body:      '时光已动，万物渐生。\n\n四方流民闻城中有宅可居，正扶老携幼、跋山涉水而来……\n\n稍候片刻，待首位百姓安顿入宅，方可继续。',
    bodyTouch: '时光已动，四方流民闻城中有宅可居，正赶路而来……\n\n稍候片刻，待首位百姓入宅。',
  },
  {
    id: 'house-entry-road', emoji: '🚧', title: '道路尚未连通官道！', targetId: 'road-tool',
    body:      '移民须沿官道入城，方能找到你的新居。\n\n当前民居的道路与入城官道尚未相连——\n请选择【道路】工具，将你的路网延伸，直至与城门口的官道接通。',
    bodyTouch: '移民须沿官道入城，当前道路与入城官道未连通！\n请选择【道路】工具，将路网接上城门口的官道。',
    hideSpotlight: (s) => s.selectedTool === 'road',
  },
  {
    id: 'waiting-resident-2', emoji: '⏳', title: '官道已通，静候移民',
    body:      '官道已然相连，移民正循路而来……\n\n稍候片刻，待首位百姓安顿入宅，方可继续。',
    bodyTouch: '官道已通！稍候片刻，待首位百姓入宅。',
  },
  {
    id: 'resident-settle', emoji: '🏠', title: '居民已入新宅！',
    body:      '首位百姓已入住民居！\n\n已为你切换到【浏览】模式——\n点击地图上闪烁的金色光圈处的民居，察看宅邸详情。',
    bodyTouch: '首位百姓已入住民居！\n已切换到【浏览】模式，点击地图上闪烁的金色光圈处的民居，察看宅邸详情。',
  },
  {
    id: 'resident-inspect', emoji: '📋', title: '宅邸详情', manual: true,
    targetId: 'house-info-panel',
    hideSpotlight: () => true,
    body:      '右侧面板即为宅邸详情，汝可于此察看：\n\n🏠 住户 — 已入住人口 / 最大容纳数\n💰 积蓄 — 此户人家现存钱财，用于购粮、纳税\n🍽 饮食多样 — 食粮种类愈丰，百姓愈是安乐\n❤ 满意度 — 此乃民心所向，满意度低则百姓离城\n\n——民者，邦之本也。万般治政，皆为黎庶温饱而设。\n\n察看完毕后，点击【继续】。',
    bodyTouch: '下方即为宅邸详情：\n\n🏠 住户 — 入住/容纳\n💰 积蓄 — 家中钱财\n🍽 饮食 — 食粮种类\n❤ 满意度 — 民心所向\n\n察看后点击【继续】。',
  },
  {
    id: 'done', emoji: '🎉', title: '初城已成！',
    body: '恭喜！你已完成新手引导：\n\n🛣 修路通衢 → 🏠 建居安民 → 🚶 移民入城\n\n这座新城，已有了第一批百姓。\n\n接下来你可以自由探索——开荒农田、兴建粮仓、设立集市，让城市欣欣向荣！',
  },
]

// ─── Commented-out farming tutorial steps ────────────────────────────────────
// {
//   id: 'farmzone-select', emoji: '🌾', title: '第四步：选择农田工具', targetId: 'farmzone-tool',
//   body: '点击底部工具栏中的【🌾粮田】按钮。只有河流附近的土地才能耕种，选中后地图会亮出绿色可耕区域。',
//   hideSpotlight: (s) => s.selectedTool === 'farmZone',
// },
// {
//   id: 'farmzone-place', emoji: '🌊', title: '第五步：河边开荒',
//   body: '地图上绿点即可耕之地。点击绿点放置粮田——只有河流五格以内的平地，才能引水灌溉、五谷丰登。',
// },
// {
//   id: 'connect-road', emoji: '🔗', title: '第六步：道路连通农田', targetId: 'road-tool',
//   body: '粮田孤立无援，无法运粮！选择【道路】工具，将道路延伸至紧邻粮田的格子。只有道路相连，牛车才能运粮出田。',
//   hideSpotlight: (s) => s.selectedTool === 'road',
// },
// {
//   id: 'granary-open', emoji: '🏗', title: '第七步：打开建筑面板', targetId: 'building-btn',
//   body: '粮食需要仓储！点击底部工具栏的【🏗 建筑】按钮，打开建筑选择面板。',
// },
// {
//   id: 'granary-select', emoji: '🏚', title: '第七步：建造粮仓',
//   targetId: 'storage-tab', fallbackTargetId: 'granary-tool',
//   body: '① 点击【仓储】标签\n② 选择【常平仓】\n③ 点击空地放置，牛车将把田间粮食运入仓中。',
//   hideSpotlight: (s, uf) => uf && s.selectedTool === 'granary',
// },
// {
//   id: 'market-open', emoji: '🏗', title: '第八步：打开建筑面板', targetId: 'building-btn',
//   body: '民以食为天，粮食需要流通！点击【🏗 建筑】按钮，准备建造集市。',
// },
// {
//   id: 'market-select', emoji: '🛒', title: '第八步：建造集市',
//   targetId: 'commercial-tab', fallbackTargetId: 'market-tool',
//   body: '① 点击【商业】标签\n② 选择【草市】\n③ 点击空地放置，百姓每十天来此购粮。',
//   hideSpotlight: (s, uf) => uf && (s.selectedTool as string) === 'market',
// },

// ─── 3D→2D beacon: projects a world tile position to screen coords ────────────

interface BeaconScreenPos {
  x: number; y: number
  /** true = in front of camera and within viewport */
  onScreen: boolean
  /** angle in radians pointing from screen center toward world point (for off-screen arrow) */
  angle: number
}

function projectTileToScreen(tileX: number, tileY: number): BeaconScreenPos | null {
  const ctrl = (window as any).__THREE_CONTROLS__
  const camera = ctrl?.object as THREE.Camera | undefined
  if (!camera) return null

  const v = new THREE.Vector3(tileX + 0.5, 0.5, tileY + 0.5)
  v.project(camera)

  const sw = window.innerWidth, sh = window.innerHeight
  const sx = (v.x * 0.5 + 0.5) * sw
  const sy = (1 - (v.y * 0.5 + 0.5)) * sh
  const behindCamera = v.z > 1

  const MARGIN = 60
  const onScreen = !behindCamera &&
    sx > MARGIN && sx < sw - MARGIN &&
    sy > MARGIN && sy < sh - MARGIN

  const angle = Math.atan2(sy - sh / 2, sx - sw / 2)

  return { x: sx, y: sy, onScreen, angle }
}

// ─── Beacon overlay component ─────────────────────────────────────────────────

function HouseBeacon({ tileX, tileY }: { tileX: number; tileY: number }) {
  const [pos, setPos] = React.useState<BeaconScreenPos | null>(null)

  React.useEffect(() => {
    let raf: number
    const tick = () => {
      setPos(projectTileToScreen(tileX, tileY))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [tileX, tileY])

  if (!pos) return null

  if (pos.onScreen) {
    // ── On-screen: pulsing gold ring + bouncing arrow ──────────────────────
    return (
      <>
        {/* Dark vignette overlay with hole */}
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9490,
          pointerEvents: 'none',
          background: 'radial-gradient(circle 80px at ' + pos.x + 'px ' + pos.y + 'px, transparent 55px, rgba(0,0,0,0.45) 80px)',
        }} />
        {/* Rings */}
        {[0, 0.4, 0.8].map((delay, i) => (
          <div key={i} style={{
            position: 'fixed',
            left: pos.x - 36, top: pos.y - 36,
            width: 72, height: 72,
            borderRadius: '50%',
            border: '3px solid rgba(255,210,50,0.85)',
            pointerEvents: 'none', zIndex: 9492,
            animation: `tut-beacon-ring 1.6s ease-out ${delay}s infinite`,
          }} />
        ))}
        {/* Center dot */}
        <div style={{
          position: 'fixed',
          left: pos.x - 8, top: pos.y - 8,
          width: 16, height: 16, borderRadius: '50%',
          background: 'rgba(255,215,0,0.9)',
          boxShadow: '0 0 12px 4px rgba(255,210,50,0.7)',
          pointerEvents: 'none', zIndex: 9493,
        }} />
        {/* Label above */}
        <div style={{
          position: 'fixed',
          left: pos.x, top: pos.y - 68,
          transform: 'translateX(-50%)',
          background: 'rgba(20,12,0,0.92)',
          border: '1px solid rgba(255,210,50,0.7)',
          borderRadius: 6, padding: '4px 12px',
          fontSize: 12, fontWeight: 700,
          fontFamily: '"Noto Serif SC", serif',
          color: '#ffd84a', whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 9494,
          boxShadow: '0 2px 12px rgba(0,0,0,0.7)',
          animation: 'tut-beacon-float 1.0s ease-in-out infinite',
        }}>
          👆 点击民居
          <span style={{
            position: 'absolute', bottom: -7, left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '7px solid rgba(255,210,50,0.7)',
          }} />
        </div>
      </>
    )
  }

  // ── Off-screen: edge compass arrow ────────────────────────────────────────
  const sw = window.innerWidth, sh = window.innerHeight
  const EDGE = 48
  const ex = Math.max(EDGE, Math.min(sw - EDGE, pos.x))
  const ey = Math.max(EDGE, Math.min(sh - EDGE, pos.y))
  // clamp to screen edge
  const clampedX = Math.max(EDGE, Math.min(sw - EDGE,
    sh / 2 + (pos.x - sw / 2) * Math.min(
      Math.abs((sh / 2 - EDGE) / (pos.y - sh / 2 + 0.001)),
      Math.abs((sw / 2 - EDGE) / (pos.x - sw / 2 + 0.001)),
      1,
    )
  ))
  const clampedY = Math.max(EDGE, Math.min(sh - EDGE,
    sh / 2 + (pos.y - sh / 2) * Math.min(
      Math.abs((sh / 2 - EDGE) / (pos.y - sh / 2 + 0.001)),
      Math.abs((sw / 2 - EDGE) / (pos.x - sw / 2 + 0.001)),
      1,
    )
  ))

  return (
    <div style={{
      position: 'fixed',
      left: clampedX, top: clampedY,
      transform: `translate(-50%, -50%) rotate(${pos.angle}rad)`,
      width: 44, height: 44,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(20,12,0,0.88)',
      border: '2px solid rgba(255,210,50,0.8)',
      borderRadius: '50%',
      color: '#ffd84a', fontSize: 22,
      pointerEvents: 'none', zIndex: 9494,
      boxShadow: '0 0 16px rgba(255,210,50,0.5)',
      animation: 'tut-beacon-float 1.0s ease-in-out infinite',
    }}>
      ➤
    </div>
  )
}

// ─── Migrant beacon: follows first migrant in real-time ──────────────────────

interface MigrantBeaconProps { migrantX: number; migrantY: number }

function MigrantBeacon({ migrantX, migrantY }: MigrantBeaconProps) {
  const [pos, setPos] = React.useState<BeaconScreenPos | null>(null)

  React.useEffect(() => {
    let raf: number
    const tick = () => {
      setPos(projectTileToScreen(migrantX, migrantY))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [migrantX, migrantY])

  if (!pos) return null

  if (pos.onScreen) {
    return (
      <>
        {/* Glow ring */}
        {[0, 0.35, 0.7].map((delay, i) => (
          <div key={i} style={{
            position: 'fixed',
            left: pos.x - 30, top: pos.y - 30,
            width: 60, height: 60,
            borderRadius: '50%',
            border: '2px solid rgba(100,220,255,0.85)',
            pointerEvents: 'none', zIndex: 9492,
            animation: `tut-beacon-ring 1.4s ease-out ${delay}s infinite`,
          }} />
        ))}
        {/* Center dot */}
        <div style={{
          position: 'fixed',
          left: pos.x - 7, top: pos.y - 7,
          width: 14, height: 14, borderRadius: '50%',
          background: 'rgba(100,220,255,0.95)',
          boxShadow: '0 0 14px 5px rgba(80,200,255,0.65)',
          pointerEvents: 'none', zIndex: 9493,
        }} />
        {/* Label */}
        <div style={{
          position: 'fixed',
          left: pos.x, top: pos.y - 62,
          transform: 'translateX(-50%)',
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid rgba(100,220,255,0.7)',
          borderRadius: 6, padding: '4px 12px',
          fontSize: 12, fontWeight: 700,
          fontFamily: '"Noto Serif SC", serif',
          color: '#6adcff', whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 9494,
          boxShadow: '0 2px 12px rgba(0,0,0,0.7)',
          animation: 'tut-beacon-float 1.0s ease-in-out infinite',
        }}>
          🚶 移民入城！
          <span style={{
            position: 'absolute', bottom: -7, left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '7px solid rgba(100,220,255,0.7)',
          }} />
        </div>
      </>
    )
  }

  // Off-screen arrow
  const sw = window.innerWidth, sh = window.innerHeight
  const EDGE = 48
  const clampedX = Math.max(EDGE, Math.min(sw - EDGE,
    sw / 2 + (pos.x - sw / 2) * Math.min(
      Math.abs((sh / 2 - EDGE) / (pos.y - sh / 2 + 0.001)),
      Math.abs((sw / 2 - EDGE) / (pos.x - sw / 2 + 0.001)),
      1,
    )
  ))
  const clampedY = Math.max(EDGE, Math.min(sh - EDGE,
    sh / 2 + (pos.y - sh / 2) * Math.min(
      Math.abs((sh / 2 - EDGE) / (pos.y - sh / 2 + 0.001)),
      Math.abs((sw / 2 - EDGE) / (pos.x - sw / 2 + 0.001)),
      1,
    )
  ))
  return (
    <div style={{
      position: 'fixed',
      left: clampedX, top: clampedY,
      transform: `translate(-50%, -50%) rotate(${pos.angle}rad)`,
      width: 44, height: 44,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,20,40,0.88)',
      border: '2px solid rgba(100,220,255,0.8)',
      borderRadius: '50%',
      color: '#6adcff', fontSize: 22,
      pointerEvents: 'none', zIndex: 9494,
      boxShadow: '0 0 16px rgba(100,220,255,0.5)',
      animation: 'tut-beacon-float 1.0s ease-in-out infinite',
    }}>➤</div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { onDismiss: () => void }

export default function Tutorial({ onDismiss }: Props) {
  const { state, selectTool } = useSimulation()

  const isTouch = React.useMemo(() =>
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0), [])

  const initRef = React.useRef<{ roads: number; houses: number } | null>(null)
  if (!initRef.current) {
    initRef.current = {
      roads:  state.roads.length,
      houses: state.buildings.filter(b => b.type === 'house').length,
    }
  }
  const init = initRef.current

  const [drawerOpen, setDrawerOpen] = React.useState(false)
  React.useEffect(() => {
    const id = setInterval(() => {
      setDrawerOpen(!!document.querySelector('.building-panel.open'))
    }, 150)
    return () => clearInterval(id)
  }, [])

  const [stepIdx, setStepIdx]       = React.useState(0)
  const [dismissed, setDismissed]   = React.useState(false)
  const [beaconRect, setBeaconRect] = React.useState<DOMRect | null>(null)
  const [usingFallback, setUsingFallback] = React.useState(false)

  const [beaconHouse, setBeaconHouse] = React.useState<{ id: string; x: number; y: number } | null>(null)

  // ── Camera-interaction detection ─────────────────────────────────────────
  const [panDone,    setPanDone]    = React.useState(false)
  const [rotateDone, setRotateDone] = React.useState(false)
  const [zoomDone,   setZoomDone]   = React.useState(false)

  React.useEffect(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    let leftDown = false, rightDown = false, startX = 0, startY = 0
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) { leftDown  = true; startX = e.clientX; startY = e.clientY }
      if (e.button === 2) { rightDown = true; startX = e.clientX; startY = e.clientY }
    }
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) leftDown  = false
      if (e.button === 2) rightDown = false
    }
    const onMouseMove = (e: MouseEvent) => {
      const d = Math.hypot(e.clientX - startX, e.clientY - startY)
      if (leftDown  && d > 12) setPanDone(true)
      if (rightDown && d > 12) setRotateDone(true)
    }
    let wheelAccum = 0
    const onWheel = (e: WheelEvent) => {
      wheelAccum += Math.abs(e.deltaY)
      if (wheelAccum > 120) setZoomDone(true)
    }
    let touchStartX = 0, touchStartY = 0, lastPinchDist = 0, lastPinchAngle = 0, pinchStartDist = 0
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY }
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        lastPinchDist  = Math.hypot(dx, dy)
        pinchStartDist = lastPinchDist
        lastPinchAngle = Math.atan2(dy, dx)
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const d = Math.hypot(e.touches[0].clientX - touchStartX, e.touches[0].clientY - touchStartY)
        if (d > 10) setPanDone(true)
      }
      if (e.touches.length === 2) {
        const dx    = e.touches[0].clientX - e.touches[1].clientX
        const dy    = e.touches[0].clientY - e.touches[1].clientY
        const dist  = Math.hypot(dx, dy)
        const angle = Math.atan2(dy, dx)
        if (Math.abs(dist - pinchStartDist) > 30) setZoomDone(true)
        const raw = Math.abs(angle - lastPinchAngle)
        const angDiff = Math.min(raw, Math.PI * 2 - raw)
        if (angDiff > 0.09) setRotateDone(true)
        if (dist > 8 || Math.hypot(dx, dy) > 8) setRotateDone(true)
        lastPinchDist  = dist
        lastPinchAngle = angle
      }
    }
    canvas.addEventListener('mousedown',  onMouseDown)
    canvas.addEventListener('mousemove',  onMouseMove)
    canvas.addEventListener('wheel',      onWheel, { passive: true })
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: true })
    window.addEventListener('mouseup',    onMouseUp)
    return () => {
      canvas.removeEventListener('mousedown',  onMouseDown)
      canvas.removeEventListener('mousemove',  onMouseMove)
      canvas.removeEventListener('wheel',      onWheel)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove',  onTouchMove)
      window.removeEventListener('mouseup',    onMouseUp)
    }
  }, [])

  const advanceTimerRef     = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduledForStepRef = React.useRef<number>(-1)
  // For steps that should be silently skipped when the condition is ALREADY met at entry
  // (e.g. house-road when the house was placed next to an existing road).
  // Stores whether the condition was satisfied the first time the step ran.
  const stepEntryDoneRef = React.useRef<Record<string, boolean>>({})
  React.useEffect(() => { stepEntryDoneRef.current = {} }, []) // clear on mount only

  const advance = React.useCallback(() => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    advanceTimerRef.current = null
    scheduledForStepRef.current = -1
    setStepIdx(i => Math.min(i + 1, STEPS.length - 1))
  }, [])

  const step = STEPS[Math.min(stepIdx, STEPS.length - 1)]

  // ── Building drawer auto-open/close ──────────────────────────────────────
  const DRAWER_STEPS = new Set<StepId>(['house-select'])
  React.useEffect(() => {
    if (DRAWER_STEPS.has(step.id)) {
      const open = (window as any).__OPEN_BUILDING_DRAWER__
      if (typeof open === 'function') open()
    } else if (step.id !== 'house-open') {
      const close = (window as any).__CLOSE_BUILDING_DRAWER__
      if (typeof close === 'function') close()
    }
  }, [step.id]) // eslint-disable-line

  // ── Auto-advance logic ───────────────────────────────────────────────────
  React.useEffect(() => {
    if (step.manual) return
    if (stepIdx >= STEPS.length - 1) return
    if (scheduledForStepRef.current === stepIdx) return

    const id = step.id
    let done = false

    if      (id === 'pan-drag')        done = panDone
    else if (id === 'pan-rotate')      done = rotateDone
    else if (id === 'pan-zoom')        done = zoomDone
    else if (id === 'house-open')      done = drawerOpen
    else if (id === 'house-select')    done = state.buildings.filter(b => b.type === 'house').length > init.houses
    else if (id === 'house-road') {
      done = state.buildings
        .filter(b => b.type === 'house' || b.type === 'manor')
        .some(b =>
          [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) =>
            state.roads.some(r => r.x === b.x + dx && r.y === b.y + dy),
          ),
        )
    }
    else if (id === 'start')           done = state.running
    else if (id === 'speed-up')        done = state.simSpeed === 2
    else if (id === 'waiting-resident') {
      const houses = state.buildings.filter(b => b.type === 'house' || b.type === 'manor')
      done = houses.length > 0 && !housesReachableFromEntry(state.roads, houses)
    }
    else if (id === 'house-entry-road') {
      const houses = state.buildings.filter(b => b.type === 'house' || b.type === 'manor')
      done = housesReachableFromEntry(state.roads, houses)
    }
    // waiting-resident-2: no auto-advance; residentSettledRef handles jump to resident-settle
    else if (id === 'resident-settle') done = beaconHouse !== null && state.selectedBuildingId === beaconHouse.id

    // For 'house-road': record whether done was true the FIRST time this step ran.
    // If already done at entry → skip silently (0 ms) so it doesn't flash.
    if (id === 'house-road' && stepEntryDoneRef.current[id] === undefined) {
      stepEntryDoneRef.current[id] = done  // capture first-seen state
    }

    if (!done) return

    const skipDelay = (id === 'house-road' && stepEntryDoneRef.current[id] === true) ? 0 : 600

    scheduledForStepRef.current = stepIdx
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null
      scheduledForStepRef.current = -1
      setStepIdx(i => Math.min(i + 1, STEPS.length - 1))
    }, skipDelay)
  }, [state, stepIdx, step.id, step.manual, init, panDone, rotateDone, zoomDone, drawerOpen, beaconHouse]) // eslint-disable-line

  // ── resident-settle: watch for first citizen with houseId ────────────────
  const residentSettledRef = React.useRef(false)
  React.useEffect(() => {
    if (residentSettledRef.current) return
    const startIdx = STEPS.findIndex(s => s.id === 'speed-up')
    if (stepIdx <= startIdx) return
    const settler = state.citizens.find(c => c.houseId)
    if (!settler) return
    const house = state.buildings.find(b => b.id === settler.houseId)
    if (!house) return
    residentSettledRef.current = true
    setBeaconHouse({ id: house.id, x: house.x, y: house.y })
    const idx = STEPS.findIndex(s => s.id === 'resident-settle')
    if (idx >= 0) setStepIdx(idx)
  }, [state.citizens, state.buildings, stepIdx]) // eslint-disable-line

  // ── resident-settle: auto-switch to pan so clicking the house selects it ─
  React.useEffect(() => {
    if (step.id === 'resident-settle') {
      selectTool('pan')
      if (beaconHouse) {
        ;(window as any).__ORE_COMPASS_TARGET__ = { id: Date.now(), x: beaconHouse.x, y: beaconHouse.y }
      }
    }
  }, [step.id]) // eslint-disable-line

  // ── Tutorial camera follow: track first migrant during waiting steps ──────
  const MIGRANT_FOLLOW_STEPS = new Set<StepId>(['waiting-resident', 'house-entry-road', 'waiting-resident-2'])
  const isMigrantFollowStep = MIGRANT_FOLLOW_STEPS.has(step.id)
  const firstMigrant = isMigrantFollowStep ? (state.migrants[0] ?? null) : null
  const migrantPos = firstMigrant ? logicalMigrantPos(firstMigrant) : null

  React.useEffect(() => {
    if (migrantPos) {
      ;(window as any).__TUTORIAL_CAM_FOLLOW__ = { x: migrantPos.x, y: migrantPos.y }
    } else {
      ;(window as any).__TUTORIAL_CAM_FOLLOW__ = null
    }
  })

  React.useEffect(() => {
    if (!isMigrantFollowStep) {
      ;(window as any).__TUTORIAL_CAM_FOLLOW__ = null
    }
  }, [isMigrantFollowStep])

  React.useEffect(() => () => { ;(window as any).__TUTORIAL_CAM_FOLLOW__ = null }, [])

  React.useEffect(() => { scheduledForStepRef.current = -1; setUsingFallback(false) }, [stepIdx])
  React.useEffect(() => () => { if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current) }, [])

  // ── Clicking the spotlight target on a manual step advances it ───────────
  React.useEffect(() => {
    if (!step.manual || !step.targetId) return
    const el = document.querySelector(`[data-tutorial="${step.targetId}"]`) as HTMLElement | null
    if (!el) return
    const onClick = () => advance()
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [step.id, step.manual, step.targetId, advance])

  // ── DOM spotlight beacon tracking ────────────────────────────────────────
  React.useEffect(() => {
    if (!step.targetId || !step.fallbackTargetId) return
    const el = document.querySelector(`[data-tutorial="${step.targetId}"]`) as HTMLElement | null
    if (!el) return
    const onClick = () => setTimeout(() => setUsingFallback(true), 150)
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [step.targetId, step.fallbackTargetId])

  const usingFallbackRef = React.useRef(usingFallback)
  React.useEffect(() => { usingFallbackRef.current = usingFallback }, [usingFallback])

  React.useEffect(() => {
    if (!step.targetId) { setBeaconRect(null); setUsingFallback(false); return }
    let raf: number

    function isReallyVisible(el: HTMLElement): boolean {
      if (el.offsetWidth === 0 || el.offsetHeight === 0) return false
      if (el.closest('[aria-hidden="true"]')) return false
      const r = el.getBoundingClientRect()
      if (r.right < -200 || r.bottom < -200 || r.left > window.innerWidth + 200 || r.top > window.innerHeight + 200) return false
      return true
    }

    const update = () => {
      if (step.fallbackTargetId) {
        const fbEl = document.querySelector(`[data-tutorial="${step.fallbackTargetId}"]`) as HTMLElement | null
        if (fbEl && (isReallyVisible(fbEl) || usingFallbackRef.current)) {
          setBeaconRect(fbEl.getBoundingClientRect())
          setUsingFallback(true)
          raf = requestAnimationFrame(update)
          return
        }
      }
      const el = document.querySelector(`[data-tutorial="${step.targetId}"]`) as HTMLElement | null
      setBeaconRect(el ? el.getBoundingClientRect() : null)
      setUsingFallback(false)
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [step.targetId, step.fallbackTargetId])

  const handleDismiss = React.useCallback(() => {
    setDismissed(true)
    setBeaconRect(null)
    onDismiss()
  }, [onDismiss])

  // ── Test hooks ────────────────────────────────────────────────────────────
  React.useEffect(() => {
    ;(window as any).__TUTORIAL_STATE__   = { stepId: step.id, stepIdx, total: STEPS.length }
    ;(window as any).__TUTORIAL_ADVANCE__ = () => advance()
    ;(window as any).__TUTORIAL_DISMISS__ = () => handleDismiss()
  })

  if (dismissed) return null

  const isDone   = step.id === 'done'
  const isManual = step.manual === true
  const PAD = 8

  // Smart panel placement — each step's panel goes where it won't block the player's
  // visual focus or the UI element they need to interact with.
  //
  //  top-right   — map-interaction steps (pan/zoom/rotate) and "waiting" steps where the
  //                player watches the migrant walk in; also steps whose spotlight is on the
  //                left side (stats-toggle) so the panel stays out of that area
  //  top-center  — steps whose spotlight is on the bottom toolbar
  //  bottom-left — resident-settle / resident-inspect (property panel is on the right)
  //  bottom-right— start step (spotlight is at the top bar, panel at bottom-right corner)
  //  center      — fallback / done screen
  type PanelPos = 'top-center' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'

  const panelPos: PanelPos = (() => {
    // Map-interaction training steps: stay in top-right corner, leave the whole map free
    if (['pan-drag', 'pan-rotate', 'pan-zoom'].includes(step.id)) return 'top-right'
    // Watching the migrant walk in: top-right so the camera follow-view isn't blocked
    if (step.id === 'waiting-resident' || step.id === 'waiting-resident-2') return 'top-right'
    // Building drawer open: anchor to top-right so the drawer (right or bottom) isn't blocked
    if (drawerOpen) return 'top-right'
    // resident panels: bottom-left — property panel is on the right
    if (step.id === 'resident-settle' || step.id === 'resident-inspect') return 'bottom-left'
    // start button is at the top bar: panel goes to bottom-right
    if (step.id === 'start') return 'bottom-right'
    // Bottom-toolbar spotlight (midY > 52%) → top-center so the spotlight is visible
    if (beaconRect) {
      const midY = beaconRect.top + beaconRect.height / 2
      return midY > window.innerHeight * 0.52 ? 'top-center' : 'center'
    }
    return 'center'
  })()

  const stepBody  = (isTouch && step.bodyTouch) ? step.bodyTouch : step.body
  const stepTitle = isTouch ? (
    step.id === 'pan-drag'   ? '平移视角：单指拖动' :
    step.id === 'pan-rotate' ? '旋转视角：双指旋转' :
    step.id === 'pan-zoom'   ? '缩放视角：双指捏合' :
    step.title
  ) : step.title

  const showSpotlight = beaconRect && !(step.hideSpotlight?.(state, usingFallback) ?? false)
  const showHouseBeacon = step.id === 'resident-settle' && beaconHouse !== null
  const showMigrantBeacon = isMigrantFollowStep && migrantPos !== null

  const mobileCompact = isTouch && step.id === 'resident-inspect'

  return (
    <>
      {/* ── 3D House Beacon ── */}
      {showHouseBeacon && <HouseBeacon tileX={beaconHouse!.x} tileY={beaconHouse!.y} />}

      {/* ── 3D Migrant Beacon ── */}
      {showMigrantBeacon && <MigrantBeacon migrantX={migrantPos!.x} migrantY={migrantPos!.y} />}

      {/* ── DOM SPOTLIGHT ── */}
      {showSpotlight && (
        <>
          <div style={{
            position: 'fixed',
            left: beaconRect.left - PAD, top: beaconRect.top - PAD,
            width: beaconRect.width + PAD * 2, height: beaconRect.height + PAD * 2,
            borderRadius: 8,
            boxShadow: `0 0 0 9999px rgba(0,0,0,0.72), 0 0 0 ${PAD + 2}px rgba(255,215,0,0.35)`,
            border: '2px solid rgba(255,215,0,0.9)',
            pointerEvents: 'none', zIndex: 9501,
          }} />
          {([0, 0.5, 1.0] as const).map((delay, i) => (
            <div key={i} style={{
              position: 'fixed',
              left: beaconRect.left - PAD, top: beaconRect.top - PAD,
              width: beaconRect.width + PAD * 2, height: beaconRect.height + PAD * 2,
              borderRadius: 8,
              border: '2px solid rgba(255,215,0,0.7)',
              pointerEvents: 'none', zIndex: 9502,
              animation: `tut-ripple 1.8s ease-out ${delay}s infinite`,
            }} />
          ))}
          <div style={{
            position: 'fixed',
            left: beaconRect.left + beaconRect.width / 2,
            top:  beaconRect.top - PAD - 36,
            transform: 'translateX(-50%)',
            background: '#c89a1e', color: '#160e00',
            fontSize: 12, fontFamily: '"Noto Serif SC", serif',
            fontWeight: 700, letterSpacing: '0.12em',
            padding: '4px 12px', borderRadius: 4,
            whiteSpace: 'nowrap', pointerEvents: 'none',
            zIndex: 9503, boxShadow: '0 2px 10px rgba(0,0,0,0.7)',
            animation: 'tut-float 1.0s ease-in-out infinite',
            display: isTouch ? 'none' : undefined,
          }}>
            👆 点这里
            <span style={{
              position: 'absolute', bottom: -7, left: '50%',
              transform: 'translateX(-50%)',
              width: 0, height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '7px solid #c89a1e',
            }} />
          </div>
        </>
      )}

      {/* ── Instruction panel ── */}
      {mobileCompact ? (
        <div data-tutorial-panel style={{
          position: 'fixed',
          top: 56, left: 8, right: 8,
          zIndex: 9510,
          background: 'rgba(8,5,2,0.72)',
          border: '1px solid rgba(200,160,55,0.65)',
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          padding: '8px 14px',
          fontFamily: '"Noto Serif SC", "SimSun", serif',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          userSelect: 'none',
        }}>
          <span style={{ fontSize: 13, color: '#f0d580', fontWeight: 700 }}>
            {step.emoji} {stepTitle} — 查看下方面板后点继续
          </span>
          <button onClick={advance} style={{
            background: 'rgba(130,95,25,0.5)', border: '1px solid rgba(220,175,70,0.75)',
            borderRadius: 4, padding: '5px 16px', color: '#f5e090',
            fontFamily: '"Noto Serif SC", serif', fontSize: 13, letterSpacing: '0.15em',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}>继续 →</button>
        </div>
      ) : (
        <div data-tutorial-panel style={{
          position: 'fixed',
          ...(panelPos === 'top-center'
            ? isTouch
              ? { top: 52, left: 8, right: 8, transform: 'none' }       // below 48px mobile top-bar
              : { top: 58, left: '50%', transform: 'translateX(-50%)' }  // below 52px desktop top-bar
            : panelPos === 'top-right'
            ? isTouch
              ? { top: 52, right: 8, transform: 'none' }                 // below 48px mobile top-bar
              : { top: 58, right: 24, transform: 'none' }                // below 52px desktop top-bar
            : panelPos === 'bottom-left'
            ? isTouch
              ? { bottom: 60, left: 8, right: 8, transform: 'none' }
              : { bottom: 24, left: 16, top: 'auto', transform: 'none' }
            : panelPos === 'bottom-right'
            ? isTouch
              ? { bottom: 60, left: 8, right: 8, transform: 'none' }
              : { bottom: 24, right: 24, top: 'auto', transform: 'none' }
            : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }),
          zIndex: 9510,
          width: isTouch ? 'min(92vw, 480px)' : 'clamp(300px, 46vw, 560px)',
          background: 'rgba(8,5,2,0.72)',
          border: '1px solid rgba(200,160,55,0.65)',
          borderRadius: 10,
          boxShadow: '0 8px 48px rgba(0,0,0,0.7)',
          padding: '18px 24px 16px',
          fontFamily: '"Noto Serif SC", "SimSun", serif',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          userSelect: 'none',
        }}>
          {/* Progress dots */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 14, justifyContent: 'center' }}>
            {STEPS.map((s, i) => (
              <div key={s.id} style={{
                height: 4, borderRadius: 2,
                width: i === stepIdx ? 22 : 4,
                background:
                  i < stepIdx   ? 'rgba(100,200,90,0.9)' :
                  i === stepIdx ? 'rgba(220,175,60,0.95)' :
                                  'rgba(180,150,70,0.18)',
                transition: 'all 0.3s ease',
              }} />
            ))}
          </div>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 22 }}>{step.emoji}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#f0d580', letterSpacing: '0.1em', flex: 1 }}>
              {stepTitle}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(180,150,70,0.4)', whiteSpace: 'nowrap' }}>
              {stepIdx + 1}&thinsp;/&thinsp;{STEPS.length}
            </span>
          </div>
          {/* Body */}
          <div style={{ fontSize: 13, color: 'rgba(220,195,145,0.88)', lineHeight: 1.9, letterSpacing: '0.05em', whiteSpace: 'pre-line' }}>
            {stepBody}
          </div>
          {/* Footer */}
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {isDone ? (
              <button onClick={handleDismiss} style={{
                background: 'rgba(80,160,50,0.35)', border: '1px solid rgba(120,200,90,0.7)',
                borderRadius: 4, padding: '7px 28px', color: '#aaee98',
                fontFamily: '"Noto Serif SC", serif', fontSize: 13, letterSpacing: '0.25em', cursor: 'pointer',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(90,180,60,0.5)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(80,160,50,0.35)')}
              >🎊 开始大展宏图</button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isManual && (
                  <button onClick={advance} style={{
                    background: 'rgba(130,95,25,0.4)', border: '1px solid rgba(220,175,70,0.75)',
                    borderRadius: 4, padding: '7px 28px', color: '#f5e090',
                    fontFamily: '"Noto Serif SC", serif', fontSize: 13, letterSpacing: '0.25em', cursor: 'pointer',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(160,115,35,0.6)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(130,95,25,0.4)')}
                  >继续 →</button>
                )}
                {!isManual && (
                  <span style={{ fontSize: 11, color: 'rgba(160,130,70,0.4)', letterSpacing: '0.08em' }}>
                    完成操作后自动进入下一步…
                  </span>
                )}
                <button onClick={advance} style={{
                  background: 'transparent', border: '1px solid rgba(160,130,60,0.28)',
                  borderRadius: 3, padding: '4px 12px', color: 'rgba(180,150,80,0.55)',
                  fontFamily: '"Noto Serif SC", serif', fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer',
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'rgba(220,185,100,0.85)'; e.currentTarget.style.borderColor = 'rgba(200,160,70,0.5)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(180,150,80,0.55)'; e.currentTarget.style.borderColor = 'rgba(160,130,60,0.28)' }}
                >略过此步</button>
              </div>
            )}
            <button onClick={handleDismiss} style={{
              background: 'transparent', border: '1px solid rgba(140,110,55,0.22)',
              borderRadius: 3, padding: '4px 14px', color: 'rgba(150,120,65,0.4)',
              fontFamily: '"Noto Serif SC", serif', fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer',
            }}>跳过教程</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes tut-ripple {
          0%   { transform: scale(1);   opacity: 0.75; }
          100% { transform: scale(2.4); opacity: 0;    }
        }
        @keyframes tut-float {
          0%, 100% { transform: translateX(-50%) translateY(0px);  }
          50%       { transform: translateX(-50%) translateY(-6px); }
        }
        @keyframes tut-beacon-ring {
          0%   { transform: scale(1);   opacity: 0.9; }
          100% { transform: scale(2.8); opacity: 0;   }
        }
        @keyframes tut-beacon-float {
          0%, 100% { transform: translateX(-50%) translateY(0px);  }
          50%       { transform: translateX(-50%) translateY(-5px); }
        }
      `}</style>
    </>
  )
}

