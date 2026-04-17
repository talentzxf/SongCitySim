/**
 * Tutorial — step-by-step guided overlay for Level 1.
 */
import React from 'react'
import { useSimulation } from '../state/simulation'

// ─── Step definitions ─────────────────────────────────────────────────────────

type StepId =
  | 'pan-intro' | 'pan-drag' | 'pan-rotate' | 'pan-zoom'
  | 'road' | 'house'
  | 'start'
  | 'farmzone-select' | 'farmzone-place'
  | 'connect-road'
  | 'granary'
  | 'market'
  | 'done'

interface TutStep {
  id: StepId
  emoji: string
  title: string
  body: string
  /** data-tutorial attribute value on the target HUD element */
  targetId?: string
  /**
   * When set, the beacon rAF loop checks if this element is visible (rect.width > 0).
   * If it is, the spotlight automatically jumps to this element instead of targetId.
   * Used for "click Tab → spotlight moves to button inside that Tab".
   */
  fallbackTargetId?: string
  /** If true, show a manual "好的！" button instead of auto-detecting */
  manual?: boolean
  /**
   * Called every render. When true, the spotlight is hidden so the user can
   * freely interact with the map/other UI.
   * Second arg = whether we are currently showing the fallback target.
   */
  hideSpotlight?: (
    s: ReturnType<typeof useSimulation>['state'],
    usingFallback: boolean,
  ) => boolean
}

const STEPS: TutStep[] = [
  {
    id: 'pan-intro', emoji: '🗺', title: '浏览模式', manual: true, targetId: 'pan-tool',
    body: '进入游戏后默认处于【浏览】模式（左侧工具栏已高亮）。\n接下来带你练习三种地图操作，完成后再开始建城。',
  },
  {
    id: 'pan-drag', emoji: '👈', title: '平移视角：左键拖拽',
    body: '在地图上 按住鼠标左键并拖动，视角将随之平移。\n试着移动到你想要建城的位置。',
  },
  {
    id: 'pan-rotate', emoji: '🖱', title: '旋转视角：右键拖拽',
    body: '在地图上 按住鼠标右键并拖动，可以旋转视角，感受地形的立体感。\n试着转一转，看看山脉和河流的走向。',
  },
  {
    id: 'pan-zoom', emoji: '🔍', title: '缩放视角：滚动滚轮',
    body: '滚动鼠标滚轮可以放大或缩小视角。\n放大找到你心仪的建城之地，准备好后将自动继续。',
  },
  {
    id: 'road', emoji: '🛣', title: '第一步：修筑道路', targetId: 'road-tool',
    body: '点击左侧工具栏中的【道路】按钮，然后在地图上拖拽铺路。道路是城市的血脉，连通万物。',
    hideSpotlight: (s) => s.selectedTool === 'road',
  },
  {
    id: 'house', emoji: '🏠', title: '第二步：建造民居',
    targetId: 'house-tool',
    body: '在左侧建筑面板【居住】标签中选择【民居】，点击道路旁的空地放置民居，让流民安居落户。',
    hideSpotlight: (s) => s.selectedTool === 'house',
  },
  {
    id: 'start', emoji: '▶', title: '第三步：开启时光', targetId: 'start-btn',
    body: '城已初具，万事俱备！点击左上方的【开始】按钮（可先调慢/×1/×2速度），让时间流转，等待移民入城。',
  },
  {
    id: 'farmzone-select', emoji: '🌾', title: '第四步：选择农田工具', targetId: 'farmzone-tool',
    body: '点击工具栏中的【🌾粮田】按钮。只有河流附近的土地才能耕种，选中后地图会亮出绿色可耕区域。',
    hideSpotlight: (s) => s.selectedTool === 'farmZone',
  },
  {
    id: 'farmzone-place', emoji: '🌊', title: '第五步：河边开荒',
    body: '地图上绿点即可耕之地。点击绿点放置粮田——只有河流五格以内的平地，才能引水灌溉、五谷丰登。',
  },
  {
    id: 'connect-road', emoji: '🔗', title: '第六步：道路连通农田', targetId: 'road-tool',
    body: '粮田孤立无援，无法运粮！选择【道路】工具，将道路延伸至紧邻粮田的格子。只有道路相连，牛车才能运粮出田。',
    hideSpotlight: (s) => s.selectedTool === 'road',
  },
  {
    id: 'granary', emoji: '🏚', title: '第七步：建造粮仓',
    targetId: 'storage-tab', fallbackTargetId: 'granary-tool',
    body: '① 点击建筑面板中的【仓储】标签\n② 选择【常平仓】（聚光灯会自动跳过来）\n③ 点击空地放置，牛车将把田间粮食运入仓中储存。',
    hideSpotlight: (s, uf) => uf && s.selectedTool === 'granary',
  },
  {
    id: 'market', emoji: '🛒', title: '第八步：建造集市',
    targetId: 'commercial-tab', fallbackTargetId: 'market-tool',
    body: '① 点击建筑面板中的【商业】标签\n② 选择【草市】（聚光灯会自动跳过来）\n③ 点击空地放置，百姓每十天来此购粮。',
    hideSpotlight: (s, uf) => uf && (s.selectedTool as string) === 'market',
  },
  {
    id: 'done', emoji: '🎉', title: '大功告成！',
    body: '完整的生产循环已然建立：\n🌾 农田丰收 → 🐂 牛车运粮 → 🏚 粮仓储存 → 🏪 集市售卖 → 🍚 百姓温饱\n\n这座新城，已生气勃勃！愿君治世，国泰民安。',
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { onDismiss: () => void }

export default function Tutorial({ onDismiss }: Props) {
  const { state } = useSimulation()

  // Snapshot initial counts once so we detect NEW placements only
  const initRef = React.useRef<{ roads: number; houses: number } | null>(null)
  if (!initRef.current) {
    initRef.current = {
      roads:  state.roads.length,
      houses: state.buildings.filter(b => b.type === 'house').length,
    }
  }
  const init = initRef.current

  const [stepIdx, setStepIdx]       = React.useState(0)
  const [dismissed, setDismissed]   = React.useState(false)
  const [beaconRect, setBeaconRect] = React.useState<DOMRect | null>(null)
  // true when the spotlight is currently on the fallback element (tab → button)
  const [usingFallback, setUsingFallback] = React.useState(false)

  // ── Camera-interaction detection ────────────────────────────────────────────
  const [panDone,    setPanDone]    = React.useState(false)
  const [rotateDone, setRotateDone] = React.useState(false)
  const [zoomDone,   setZoomDone]   = React.useState(false)

  React.useEffect(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    let leftDown = false, rightDown = false, startX = 0, startY = 0
    const onDown  = (e: MouseEvent) => {
      if (e.button === 0) { leftDown  = true; startX = e.clientX; startY = e.clientY }
      if (e.button === 2) { rightDown = true; startX = e.clientX; startY = e.clientY }
    }
    const onUp    = (e: MouseEvent) => { if (e.button === 0) leftDown = false; if (e.button === 2) rightDown = false }
    const onMove  = (e: MouseEvent) => {
      const d = Math.hypot(e.clientX - startX, e.clientY - startY)
      if (leftDown  && d > 12) setPanDone(true)
      if (rightDown && d > 12) setRotateDone(true)
    }
    const onWheel = () => setZoomDone(true)
    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup',   onUp)
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('wheel',     onWheel, { passive: true })
    return () => {
      canvas.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup',   onUp)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('wheel',     onWheel)
    }
  }, [])

  // ── Step-advance (ref-managed timer) ────────────────────────────────────────
  const advanceTimerRef     = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduledForStepRef = React.useRef<number>(-1)

  const advance = React.useCallback(() => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    advanceTimerRef.current = null
    scheduledForStepRef.current = -1
    setStepIdx(i => Math.min(i + 1, STEPS.length - 1))
  }, [])

  const step = STEPS[Math.min(stepIdx, STEPS.length - 1)]

  React.useEffect(() => {
    if (step.manual) return                             // manual steps need button click
    if (stepIdx >= STEPS.length - 1) return
    if (scheduledForStepRef.current === stepIdx) return // timer already running

    const id = step.id
    let done = false

    if      (id === 'pan-drag')         done = panDone
    else if (id === 'pan-rotate')       done = rotateDone
    else if (id === 'pan-zoom')         done = zoomDone
    else if (id === 'road')             done = state.roads.length > init.roads
    else if (id === 'house')            done = state.buildings.filter(b => b.type === 'house').length > init.houses
    else if (id === 'start')            done = state.running
    else if (id === 'farmzone-select')  done = state.selectedTool === 'farmZone'
    else if (id === 'farmzone-place')   done = state.farmZones.length > 0
    else if (id === 'connect-road') {
      done = state.farmZones.some(z => {
        const tiles = [
          { x: z.x,     y: z.y     }, { x: z.x + 1, y: z.y     },
          { x: z.x,     y: z.y + 1 }, { x: z.x + 1, y: z.y + 1 },
        ]
        return tiles.some(t =>
          state.roads.some(r =>
            (Math.abs(r.x - t.x) === 1 && r.y === t.y) ||
            (r.x === t.x && Math.abs(r.y - t.y) === 1),
          ),
        )
      })
    }
    else if (id === 'granary') done = state.buildings.some(b => b.type === 'granary')
    else if (id === 'market')  done = state.buildings.some(b => (b.type as string) === 'market')

    if (!done) return

    scheduledForStepRef.current = stepIdx
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null
      scheduledForStepRef.current = -1
      setStepIdx(i => Math.min(i + 1, STEPS.length - 1))
    }, 600)
  }, [state, stepIdx, step.id, step.manual, init, panDone, rotateDone, zoomDone]) // eslint-disable-line

  React.useEffect(() => { scheduledForStepRef.current = -1; setUsingFallback(false) }, [stepIdx])
  React.useEffect(() => () => { if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current) }, [])

  // ── Click on primary target → force-switch to fallback ────────────────────
  React.useEffect(() => {
    if (!step.targetId || !step.fallbackTargetId) return
    const el = document.querySelector(`[data-tutorial="${step.targetId}"]`) as HTMLElement | null
    if (!el) return
    const onClick = () => {
      setTimeout(() => setUsingFallback(true), 150)
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [step.targetId, step.fallbackTargetId])

  // ── Beacon rAF: primary → auto-switch to fallback when fallback becomes truly visible ──
  // usingFallback ref so rAF closure can read latest value without re-registering
  const usingFallbackRef = React.useRef(usingFallback)
  React.useEffect(() => { usingFallbackRef.current = usingFallback }, [usingFallback])

  React.useEffect(() => {
    if (!step.targetId) { setBeaconRect(null); setUsingFallback(false); return }
    let raf: number

    /**
     * Robust visibility check — works regardless of how Ant Design hides inactive
     * tab panels (display:none, aria-hidden, CSS transform, etc.):
     *  1. offsetWidth/Height > 0  → not hidden via display:none on self/ancestor
     *  2. no ancestor with aria-hidden="true"  → not hidden via Ant Design tab mechanism
     *  3. getBoundingClientRect inside viewport  → not transformed off-screen
     */
    function isReallyVisible(el: HTMLElement): boolean {
      if (el.offsetWidth === 0 || el.offsetHeight === 0) return false
      if (el.closest('[aria-hidden="true"]')) return false
      const r = el.getBoundingClientRect()
      // Must be within a reasonable distance of the viewport
      if (r.right < -200 || r.bottom < -200 || r.left > window.innerWidth + 200 || r.top > window.innerHeight + 200) return false
      return true
    }

    const update = () => {
      if (step.fallbackTargetId) {
        const fbEl = document.querySelector(
          `[data-tutorial="${step.fallbackTargetId}"]`,
        ) as HTMLElement | null
        // Switch to fallback if: it's visible, OR we've already committed to it (e.g. tab was clicked)
        if (fbEl && (isReallyVisible(fbEl) || usingFallbackRef.current)) {
          setBeaconRect(fbEl.getBoundingClientRect())
          setUsingFallback(true)
          raf = requestAnimationFrame(update)
          return
        }
      }
      // Use primary target
      const el = document.querySelector(
        `[data-tutorial="${step.targetId}"]`,
      ) as HTMLElement | null
      setBeaconRect(el ? el.getBoundingClientRect() : null)
      setUsingFallback(false)
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [step.targetId, step.fallbackTargetId])

  const handleDismiss = React.useCallback(() => {
    setDismissed(true)
    setBeaconRect(null)   // immediately kill spotlight before next render
    onDismiss()
  }, [onDismiss])

  if (dismissed) return null

  const isDone   = step.id === 'done'
  const isManual = step.manual === true
  const PAD = 8

  const showSpotlight = beaconRect && !(step.hideSpotlight?.(state, usingFallback) ?? false)

  return (
    <>
      {/* ── SPOTLIGHT ── */}
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
            top:  beaconRect.top  - PAD - 36,
            transform: 'translateX(-50%)',
            background: '#c89a1e', color: '#160e00',
            fontSize: 12, fontFamily: '"Noto Serif SC", serif',
            fontWeight: 700, letterSpacing: '0.12em',
            padding: '4px 12px', borderRadius: 4,
            whiteSpace: 'nowrap', pointerEvents: 'none',
            zIndex: 9503, boxShadow: '0 2px 10px rgba(0,0,0,0.7)',
            animation: 'tut-float 1.0s ease-in-out infinite',
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
      <div style={{
        position: 'fixed', bottom: 28, left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9510,
        width: 'clamp(300px, 46vw, 560px)',
        background: 'rgba(8,5,2,0.96)',
        border: '1px solid rgba(200,160,55,0.65)',
        borderRadius: 10,
        boxShadow: '0 8px 48px rgba(0,0,0,0.9)',
        padding: '18px 24px 16px',
        fontFamily: '"Noto Serif SC", "SimSun", serif',
        backdropFilter: 'blur(8px)',
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
            {step.title}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(180,150,70,0.4)', whiteSpace: 'nowrap' }}>
            {stepIdx + 1}&thinsp;/&thinsp;{STEPS.length}
          </span>
        </div>

        {/* Body */}
        <div style={{ fontSize: 13, color: 'rgba(220,195,145,0.88)', lineHeight: 1.9, letterSpacing: '0.05em', whiteSpace: 'pre-line' }}>
          {step.body}
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
          ) : isManual ? (
            <button onClick={advance} style={{
              background: 'rgba(130,95,25,0.4)', border: '1px solid rgba(220,175,70,0.75)',
              borderRadius: 4, padding: '7px 28px', color: '#f5e090',
              fontFamily: '"Noto Serif SC", serif', fontSize: 13, letterSpacing: '0.25em', cursor: 'pointer',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(160,115,35,0.6)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(130,95,25,0.4)')}
            >好的，出发！→</button>
          ) : (
            <span style={{ fontSize: 11, color: 'rgba(160,130,70,0.4)', letterSpacing: '0.08em' }}>
              完成操作后自动进入下一步…
            </span>
          )}
          <button onClick={handleDismiss} style={{
            background: 'transparent', border: '1px solid rgba(140,110,55,0.22)',
            borderRadius: 3, padding: '4px 14px', color: 'rgba(150,120,65,0.4)',
            fontFamily: '"Noto Serif SC", serif', fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer',
          }}>跳过教程</button>
        </div>
      </div>

      <style>{`
        @keyframes tut-ripple {
          0%   { transform: scale(1);   opacity: 0.75; }
          100% { transform: scale(2.4); opacity: 0;    }
        }
        @keyframes tut-float {
          0%, 100% { transform: translateX(-50%) translateY(0px);  }
          50%       { transform: translateX(-50%) translateY(-6px); }
        }
      `}</style>
    </>
  )
}

