/**
 * EventTutorial — event-driven contextual tutorial sequences.
 */
import React from 'react'
import { useSimulation } from '../state/simulation'

// ─── Types ────────────────────────────────────────────────────────────────────

type SeqStepId =
  | 'notice-badge'
  | 'open-advice'
  | 'flash-advice'
  | 'close-stats'
  | 'open-building'
  | 'select-farm-tab'
  | 'place-farm'
  | 'connect-farm-road'
  | 'done-farming'

interface SeqStep {
  id: SeqStepId
  emoji: string
  title: string
  body: string
  bodyTouch?: string
  targetId?: string
  manual?: boolean
  /** Auto step that flashes the target 3× then advances automatically */
  flash?: boolean
  hideSpotlight?: (s: ReturnType<typeof useSimulation>['state']) => boolean
}

const UNEMPLOY_SEQ: SeqStep[] = [
  {
    id: 'notice-badge',
    emoji: '🔴', title: '奏报有急务！',
    targetId: 'stats-toggle',
    body: '左侧按钮出现了彩色徽章——臣子有事上奏！\n\n点击 ▶ 按钮，展开【城市概览】查看详情。',
    bodyTouch: '左侧按钮出现了彩色徽章——臣子有事上奏！\n点击 ▶ 按钮展开【城市概览】。',
    hideSpotlight: () => !document.querySelector('.stats-panel.collapsed'),
  },
  {
    id: 'open-advice',
    emoji: '📋', title: '打开上奏',
    targetId: 'advice-label',
    body: '城市概览已展开。\n\n点击【📋 上奏】折叠栏，查看臣子的奏报。',
    bodyTouch: '点击【📋 上奏】折叠栏查看奏报。',
    hideSpotlight: () => !!document.querySelector('[data-tutorial="advice-panel"] .ant-collapse-item-active'),
  },
  {
    id: 'flash-advice',
    emoji: '⚡', title: '注意奏报！',
    targetId: 'advice-panel',
    flash: true,
    body: '居民无所事事，没有工作！\n\n接下来引导你建造农田，让百姓有地可耕。',
    bodyTouch: '居民没有工作！接下来建造农田，让百姓耕作。',
  },
  {
    id: 'close-stats',
    emoji: '◀', title: '收起概览，准备建造',
    targetId: 'stats-toggle',
    body: '了解了奏情，收起城市概览，腾出地图视野，准备建造农田。\n\n点击 ◀ 按钮收起面板。',
    bodyTouch: '点击 ◀ 按钮收起面板，腾出视野。',
    hideSpotlight: () => !!document.querySelector('.stats-panel.collapsed'),
  },
  {
    id: 'open-building',
    emoji: '🏗', title: '打开建造面板',
    targetId: 'building-btn',
    body: '点击底部工具栏右侧的【🏗 建筑】按钮，打开建造面板。',
    hideSpotlight: () => !!(window as any).__BUILDING_DRAWER_OPEN__,
  },
  {
    id: 'select-farm-tab',
    emoji: '🌾', title: '切换到农业标签',
    targetId: 'farming-tab',
    body: '在建造面板中，点击【农业】标签。',
    hideSpotlight: (s) => s.selectedTool === 'farmZone' || s.selectedTool === 'teaZone',
  },
  {
    id: 'place-farm',
    emoji: '🌊', title: '在河边放置粮田',
    targetId: 'farmzone-tool',
    body: '点击【粮田】按钮，然后在地图上河流附近的绿色可耕区域点击放置。\n\n只有河流五格内的平地才能种粮。',
    bodyTouch: '点击【粮田】，然后在河边绿色区域放置。',
    hideSpotlight: (s) => s.selectedTool === 'farmZone',
  },
  {
    id: 'connect-farm-road',
    emoji: '🛤', title: '将道路连接至农田',
    targetId: 'road-tool',
    body: '粮田已放置！农夫需要道路才能运粮进仓。\n\n选择【道路】工具，将道路延伸至紧邻粮田的格子。',
    bodyTouch: '选择【道路】工具，将道路铺至粮田旁边。',
    hideSpotlight: (s) => s.selectedTool === 'road',
  },
  {
    id: 'done-farming',
    emoji: '🎊', title: '农田已就绪！',
    manual: true,
    body: '太好了！农田与道路已连通。\n\n农夫将在每个季节播种、收割，并将粮食运入粮仓。\n\n接下来可以考虑：\n🏚 建造【常平仓】储存粮食\n🛒 建造【草市】让居民购粮',
    bodyTouch: '太好了！农夫将开始耕作运粮。\n可以继续建造粮仓和集市。',
  },
]

// ─── Spotlight ────────────────────────────────────────────────────────────────

const PAD = 8

/** Normal interactive spotlight with gold border + ripples + "点这里" label */
function Spotlight({ targetId }: { targetId: string }) {
  const [rect, setRect] = React.useState<DOMRect | null>(null)

  React.useEffect(() => {
    let raf: number
    const tick = () => {
      const el = document.querySelector(`[data-tutorial="${targetId}"]`) as HTMLElement | null
      setRect(el ? el.getBoundingClientRect() : null)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [targetId])

  if (!rect) return null

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9401, pointerEvents: 'none',
        background: 'rgba(0,0,0,0.55)',
        WebkitMaskImage: `radial-gradient(ellipse ${rect.width + PAD * 2 + 20}px ${rect.height + PAD * 2 + 20}px at ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px, transparent 60%, black 90%)`,
        maskImage: `radial-gradient(ellipse ${rect.width + PAD * 2 + 20}px ${rect.height + PAD * 2 + 20}px at ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px, transparent 60%, black 90%)`,
      }} />
      <div style={{
        position: 'fixed',
        left: rect.left - PAD, top: rect.top - PAD,
        width: rect.width + PAD * 2, height: rect.height + PAD * 2,
        borderRadius: 8,
        border: '2px solid rgba(255,215,0,0.9)',
        boxShadow: `0 0 0 ${PAD + 2}px rgba(255,215,0,0.25)`,
        pointerEvents: 'none', zIndex: 9402,
      }} />
      {([0, 0.5, 1.0] as const).map((delay, i) => (
        <div key={i} style={{
          position: 'fixed',
          left: rect.left - PAD, top: rect.top - PAD,
          width: rect.width + PAD * 2, height: rect.height + PAD * 2,
          borderRadius: 8, border: '2px solid rgba(255,215,0,0.7)',
          pointerEvents: 'none', zIndex: 9403,
          animation: `evt-tut-ripple 1.8s ease-out ${delay}s infinite`,
        }} />
      ))}
      <div style={{
        position: 'fixed',
        left: rect.left + rect.width / 2, top: rect.top - PAD - 34,
        transform: 'translateX(-50%)',
        background: '#c89a1e', color: '#160e00',
        fontSize: 12, fontFamily: '"Noto Serif SC", serif',
        fontWeight: 700, padding: '3px 10px', borderRadius: 4,
        whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 9404,
        boxShadow: '0 2px 10px rgba(0,0,0,0.7)',
        animation: 'evt-tut-float 1.0s ease-in-out infinite',
      }}>
        👆 点这里
        <span style={{
          position: 'absolute', bottom: -7, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
          borderTop: '7px solid #c89a1e',
        }} />
      </div>
    </>
  )
}

/** Flash spotlight: pulses the target border 3× then fades — no "点这里" label, no interaction */
function FlashSpotlight({ targetId }: { targetId: string }) {
  const [rect, setRect] = React.useState<DOMRect | null>(null)

  React.useEffect(() => {
    let raf: number
    const tick = () => {
      const el = document.querySelector(`[data-tutorial="${targetId}"]`) as HTMLElement | null
      setRect(el ? el.getBoundingClientRect() : null)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [targetId])

  if (!rect) return null

  return (
    <>
      {/* Dim overlay — lighter so content is readable */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9401, pointerEvents: 'none',
        background: 'rgba(0,0,0,0.45)',
        WebkitMaskImage: `radial-gradient(ellipse ${rect.width + 60}px ${rect.height + 60}px at ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px, transparent 50%, black 85%)`,
        maskImage: `radial-gradient(ellipse ${rect.width + 60}px ${rect.height + 60}px at ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px, transparent 50%, black 85%)`,
      }} />
      {/* 3-pulse border */}
      <div style={{
        position: 'fixed',
        left: rect.left - PAD, top: rect.top - PAD,
        width: rect.width + PAD * 2, height: rect.height + PAD * 2,
        borderRadius: 8,
        border: '3px solid rgba(255,220,60,0.9)',
        pointerEvents: 'none', zIndex: 9402,
        animation: 'evt-tut-3pulse 2.4s ease-in-out forwards',
      }} />
      {/* Attention label */}
      <div style={{
        position: 'fixed',
        left: rect.left + rect.width / 2, top: rect.top - PAD - 34,
        transform: 'translateX(-50%)',
        background: 'rgba(180,30,30,0.92)', color: '#ffe8e0',
        fontSize: 12, fontFamily: '"Noto Serif SC", serif',
        fontWeight: 700, padding: '3px 12px', borderRadius: 4,
        whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 9404,
        boxShadow: '0 2px 10px rgba(0,0,0,0.7)',
        animation: 'evt-tut-float 1.0s ease-in-out infinite',
      }}>
        ⚠ 注意！
        <span style={{
          position: 'absolute', bottom: -7, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
          borderTop: '7px solid rgba(180,30,30,0.92)',
        }} />
      </div>
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  mainDone: boolean
  onDismiss?: () => void
}

export default function EventTutorial({ mainDone, onDismiss }: Props) {
  const { state, selectTool } = useSimulation()

  const isTouch = React.useMemo(() =>
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0), [])

  const [activeSeq, setActiveSeq] = React.useState<SeqStep[] | null>(null)
  const [stepIdx,   setStepIdx]   = React.useState(0)
  const [dismissed, setDismissed] = React.useState(false)
  const firedRef = React.useRef<Set<string>>(new Set())

  const advance = React.useCallback(() => {
    setStepIdx(i => (!activeSeq ? i : Math.min(i + 1, activeSeq.length - 1)))
  }, [activeSeq])

  // ── Trigger: first unemployment after main tutorial ───────────────────────
  React.useEffect(() => {
    if (!mainDone) return
    if (firedRef.current.has('unemployment-farming')) return
    if (state.citizens.length === 0) return
    const idleCount = state.citizens.filter(c => !c.workplaceId && !c.farmZoneId).length
    if (idleCount === 0) return
    firedRef.current.add('unemployment-farming')
    setActiveSeq(UNEMPLOY_SEQ)
    setStepIdx(0)
    setDismissed(false)
  }, [mainDone, state.citizens]) // eslint-disable-line

  // ── Auto-advance + flash timer ────────────────────────────────────────────
  const advTimerRef   = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduledRef  = React.useRef(-1)
  const flashStartRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!activeSeq || dismissed) return
    const step = activeSeq[stepIdx]
    if (!step || step.manual) return
    if (scheduledRef.current === stepIdx) return

    const id = step.id
    let done = false

    if (id === 'notice-badge')
      done = !document.querySelector('.stats-panel.collapsed')
    else if (id === 'open-advice')
      done = !!document.querySelector('[data-tutorial="advice-panel"] .ant-collapse-item-active')
    else if (id === 'flash-advice') {
      if (flashStartRef.current === null) flashStartRef.current = Date.now()
      done = Date.now() - flashStartRef.current >= 2500
    }
    else if (id === 'close-stats')
      done = !!document.querySelector('.stats-panel.collapsed')
    else if (id === 'open-building')
      done = !!(window as any).__BUILDING_DRAWER_OPEN__
    else if (id === 'select-farm-tab')
      done = state.selectedTool === 'farmZone' || state.selectedTool === 'teaZone'
    else if (id === 'place-farm')
      done = state.farmZones.length > 0
    else if (id === 'connect-farm-road')
      done = state.farmZones.some(z =>
        [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) =>
          state.roads.some(r => r.x === z.x + dx && r.y === z.y + dy)
        )
      )

    if (!done) return
    scheduledRef.current = stepIdx
    if (advTimerRef.current) clearTimeout(advTimerRef.current)
    advTimerRef.current = setTimeout(() => {
      advTimerRef.current = null
      scheduledRef.current = -1
      setStepIdx(i => Math.min(i + 1, activeSeq.length - 1))
    }, step.flash ? 100 : 600)
  }) // intentional: runs every render to poll DOM + flash timer

  React.useEffect(() => { scheduledRef.current = -1; flashStartRef.current = null }, [stepIdx])
  React.useEffect(() => () => { if (advTimerRef.current) clearTimeout(advTimerRef.current) }, [])

  // ── Pan tool for connect-farm-road ────────────────────────────────────────
  const step = activeSeq?.[stepIdx] ?? null
  React.useEffect(() => {
    if (step?.id === 'connect-farm-road') selectTool('pan')
  }, [step?.id]) // eslint-disable-line

  // ── Track target rect for smart panel positioning ─────────────────────────
  const [targetRect, setTargetRect] = React.useState<DOMRect | null>(null)
  React.useEffect(() => {
    if (!step?.targetId) { setTargetRect(null); return }
    let raf: number
    const tick = () => {
      const el = document.querySelector(`[data-tutorial="${step.targetId}"]`) as HTMLElement | null
      setTargetRect(el ? el.getBoundingClientRect() : null)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [step?.targetId])

  const handleDismiss = React.useCallback(() => { setDismissed(true); onDismiss?.() }, [onDismiss])
  const handleDone    = React.useCallback(() => { setDismissed(true); onDismiss?.() }, [onDismiss])

  if (!activeSeq || dismissed || !step) return null

  const isDone   = step.id === 'done-farming'
  const isManual = step.manual === true
  const stepBody = (isTouch && step.bodyTouch) ? step.bodyTouch : step.body

  const showSpotlight      = !step.flash && step.targetId && !(step.hideSpotlight?.(state) ?? false)
  const showFlashSpotlight = step.flash && step.targetId

  // Panel placement:
  //  • Building drawer open → center (don't block the drawer)
  //  • Bottom-toolbar target (midY > 52%) → top-center
  //  • Everything else → center
  const buildingDrawerOpen = !!(window as any).__BUILDING_DRAWER_OPEN__
  const panelAtTop = !buildingDrawerOpen && !!targetRect &&
    (targetRect.top + targetRect.height / 2) > window.innerHeight * 0.52

  const panelStyle: React.CSSProperties = panelAtTop
    ? isTouch
      ? { top: 8,  left: 8, right: 8,  transform: 'none' }
      : { top: 24, left: '50%', transform: 'translateX(-50%)' }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }

  return (
    <>
      {showSpotlight      && <Spotlight      targetId={step.targetId!} />}
      {showFlashSpotlight && <FlashSpotlight targetId={step.targetId!} />}

      {/* ── Instruction panel ── */}
      <div style={{
        position: 'fixed',
        ...panelStyle,
        zIndex: 9410,
        width: isTouch ? 'min(92vw, 480px)' : 'clamp(300px, 44vw, 520px)',
        background: 'rgba(8,5,2,0.78)',
        border: '1px solid rgba(200,160,55,0.65)',
        borderRadius: 10,
        boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
        padding: '16px 20px 14px',
        fontFamily: '"Noto Serif SC", "SimSun", serif',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        userSelect: 'none',
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, justifyContent: 'center' }}>
          {activeSeq.map((s, i) => (
            <div key={s.id} style={{
              height: 4, borderRadius: 2,
              width: i === stepIdx ? 20 : 4,
              background:
                i < stepIdx   ? 'rgba(100,200,90,0.9)' :
                i === stepIdx ? 'rgba(220,175,60,0.95)' :
                                'rgba(180,150,70,0.18)',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 20 }}>{step.emoji}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f0d580', letterSpacing: '0.08em', flex: 1 }}>
            {step.title}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(180,150,70,0.4)', whiteSpace: 'nowrap' }}>
            {stepIdx + 1}&thinsp;/&thinsp;{activeSeq.length}
          </span>
        </div>
        {/* Body */}
        <div style={{ fontSize: 13, color: 'rgba(220,195,145,0.88)', lineHeight: 1.85, letterSpacing: '0.04em', whiteSpace: 'pre-line' }}>
          {stepBody}
        </div>
        {/* Footer */}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {isDone ? (
            <button onClick={handleDone} style={{
              background: 'rgba(80,160,50,0.35)', border: '1px solid rgba(120,200,90,0.7)',
              borderRadius: 4, padding: '6px 24px', color: '#aaee98',
              fontFamily: '"Noto Serif SC", serif', fontSize: 13, letterSpacing: '0.2em', cursor: 'pointer',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(90,180,60,0.5)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(80,160,50,0.35)')}
            >🎊 知道了，继续建城</button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isManual && (
                <button onClick={advance} style={{
                  background: 'rgba(130,95,25,0.4)', border: '1px solid rgba(220,175,70,0.75)',
                  borderRadius: 4, padding: '6px 24px', color: '#f5e090',
                  fontFamily: '"Noto Serif SC", serif', fontSize: 13, letterSpacing: '0.2em', cursor: 'pointer',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(160,115,35,0.6)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(130,95,25,0.4)')}
                >继续 →</button>
              )}
              {!isManual && !step.flash && (
                <span style={{ fontSize: 11, color: 'rgba(160,130,70,0.4)', letterSpacing: '0.07em' }}>
                  完成操作后自动进入下一步…
                </span>
              )}
              {step.flash && (
                <span style={{ fontSize: 11, color: 'rgba(220,120,60,0.7)', letterSpacing: '0.07em' }}>
                  ⚡ 请注意上方奏报…
                </span>
              )}
              <button onClick={advance} style={{
                background: 'transparent', border: '1px solid rgba(160,130,60,0.28)',
                borderRadius: 3, padding: '3px 10px', color: 'rgba(180,150,80,0.55)',
                fontFamily: '"Noto Serif SC", serif', fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer',
              }}
                onMouseEnter={e => { e.currentTarget.style.color = 'rgba(220,185,100,0.85)'; e.currentTarget.style.borderColor = 'rgba(200,160,70,0.5)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(180,150,80,0.55)'; e.currentTarget.style.borderColor = 'rgba(160,130,60,0.28)' }}
              >略过此步</button>
            </div>
          )}
          <button onClick={handleDismiss} style={{
            background: 'transparent', border: '1px solid rgba(140,110,55,0.22)',
            borderRadius: 3, padding: '3px 12px', color: 'rgba(150,120,65,0.4)',
            fontFamily: '"Noto Serif SC", serif', fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer',
          }}>关闭引导</button>
        </div>
      </div>

      <style>{`
        @keyframes evt-tut-ripple {
          0%   { transform: scale(1);   opacity: 0.75; }
          100% { transform: scale(2.2); opacity: 0;    }
        }
        @keyframes evt-tut-float {
          0%, 100% { transform: translateX(-50%) translateY(0px);  }
          50%       { transform: translateX(-50%) translateY(-5px); }
        }
        @keyframes evt-tut-3pulse {
          0%   { border-color: rgba(255,220,60,0.3); box-shadow: 0 0 0 0 rgba(255,200,50,0); }
          14%  { border-color: rgba(255,240,80,1);   box-shadow: 0 0 32px 8px rgba(255,200,50,0.65); }
          28%  { border-color: rgba(255,220,60,0.3); box-shadow: 0 0 0 0 rgba(255,200,50,0); }
          46%  { border-color: rgba(255,240,80,1);   box-shadow: 0 0 32px 8px rgba(255,200,50,0.65); }
          60%  { border-color: rgba(255,220,60,0.3); box-shadow: 0 0 0 0 rgba(255,200,50,0); }
          76%  { border-color: rgba(255,240,80,1);   box-shadow: 0 0 32px 8px rgba(255,200,50,0.65); }
          100% { border-color: rgba(255,220,60,0.4); box-shadow: 0 0 0 0 rgba(255,200,50,0); }
        }
      `}</style>
    </>
  )
}

