/**
 * EventTutorial — event-driven contextual tutorial sequences.
 *
 * Unlike the linear Tutorial (step-by-step from day 1), EventTutorial watches
 * game-state events and fires short guided sequences when notable situations arise.
 *
 * Current sequences
 * ─────────────────
 * "unemployment-farming"
 *   Trigger: first time idle citizens appear after at least one settler
 *   Flow:    badge notice → open stats → open 上奏 → read → close stats
 *            → open buildings → farming tab → place farmZone → connect road
 */
import React from 'react'
import { useSimulation } from '../state/simulation'

// ─── Types ────────────────────────────────────────────────────────────────────

type SeqStepId =
  | 'notice-badge'
  | 'open-stats'
  | 'open-advice'
  | 'read-advice'
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
  /** Return true → hide spotlight even if targetId is set */
  hideSpotlight?: (s: ReturnType<typeof useSimulation>['state']) => boolean
}

const UNEMPLOY_SEQ: SeqStep[] = [
  {
    id: 'notice-badge',
    emoji: '🔴', title: '奏报有急务！',
    targetId: 'stats-toggle',
    body: '左侧按钮出现了红/黄色徽章——臣子有事上奏！\n\n点击 ▶ 按钮，展开【城市概览】查看详情。',
    bodyTouch: '左侧按钮出现了彩色徽章——臣子有事上奏！\n点击 ▶ 按钮展开【城市概览】。',
    hideSpotlight: () => !document.querySelector('.stats-panel.collapsed'),
  },
  {
    id: 'open-stats',
    emoji: '📊', title: '展开城市概览',
    targetId: 'stats-toggle',
    body: '点击 ▶ 按钮，展开左侧的【城市概览】面板。',
    bodyTouch: '点击 ▶ 按钮展开左侧面板。',
    hideSpotlight: () => !document.querySelector('.stats-panel.collapsed'),
  },
  {
    id: 'open-advice',
    emoji: '📋', title: '打开上奏',
    targetId: 'advice-label',
    body: '城市概览已展开。\n\n点击【📋 上奏】折叠栏，查看臣子的奏报。',
    bodyTouch: '点击【📋 上奏】折叠栏，查看奏报。',
    hideSpotlight: (s) => {
      const panel = document.querySelector('[data-tutorial="advice-panel"]')
      if (!panel) return true
      // antd Collapse: expanded when the content is visible (no 'ant-collapse-item-active' absent)
      return !!panel.querySelector('.ant-collapse-item-active')
    },
  },
  {
    id: 'read-advice',
    emoji: '👀', title: '阅读奏报', manual: true,
    targetId: 'advice-panel',
    hideSpotlight: () => true,
    body: '看到了吗？居民无所事事，没有工作！\n\n居民需要农田、工坊或集市才能就业。\n最简单的方法是：在河边开辟粮田，让百姓耕作。\n\n阅读完毕后点击【继续】。',
    bodyTouch: '居民没有工作！\n最简单的办法：在河边开辟粮田。\n\n读完后点击【继续】。',
  },
  {
    id: 'close-stats',
    emoji: '◀', title: '收起概览，准备建造',
    targetId: 'stats-toggle',
    body: '关闭城市概览，腾出地图视野，然后开始建造农田。\n\n点击 ◀ 按钮收起面板。',
    bodyTouch: '点击 ◀ 按钮收起面板，腾出视野。',
    hideSpotlight: () => !!document.querySelector('.stats-panel.collapsed'),
  },
  {
    id: 'open-building',
    emoji: '🏗', title: '打开建造面板',
    targetId: 'building-btn',
    body: '点击底部工具栏右侧的【🏗 建筑】按钮，打开建造面板。',
    hideSpotlight: (s) => {
      return !!(window as any).__BUILDING_DRAWER_OPEN__
    },
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

// ─── Spotlight helper (same approach as Tutorial.tsx) ────────────────────────

const PAD = 8

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
      {/* Dark overlay with cut-out */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9401, pointerEvents: 'none',
        background: 'rgba(0,0,0,0.55)',
        WebkitMaskImage: `radial-gradient(ellipse ${rect.width + PAD * 2 + 20}px ${rect.height + PAD * 2 + 20}px at ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px, transparent 60%, black 90%)`,
        maskImage: `radial-gradient(ellipse ${rect.width + PAD * 2 + 20}px ${rect.height + PAD * 2 + 20}px at ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px, transparent 60%, black 90%)`,
      }} />
      {/* Gold border */}
      <div style={{
        position: 'fixed',
        left: rect.left - PAD, top: rect.top - PAD,
        width: rect.width + PAD * 2, height: rect.height + PAD * 2,
        borderRadius: 8,
        boxShadow: `0 0 0 9999px rgba(0,0,0,0.0), 0 0 0 ${PAD + 2}px rgba(255,215,0,0.35)`,
        border: '2px solid rgba(255,215,0,0.9)',
        pointerEvents: 'none', zIndex: 9402,
      }} />
      {/* Ripples */}
      {([0, 0.5, 1.0] as const).map((delay, i) => (
        <div key={i} style={{
          position: 'fixed',
          left: rect.left - PAD, top: rect.top - PAD,
          width: rect.width + PAD * 2, height: rect.height + PAD * 2,
          borderRadius: 8,
          border: '2px solid rgba(255,215,0,0.7)',
          pointerEvents: 'none', zIndex: 9403,
          animation: `evt-tut-ripple 1.8s ease-out ${delay}s infinite`,
        }} />
      ))}
      {/* "点这里" label */}
      <div style={{
        position: 'fixed',
        left: rect.left + rect.width / 2,
        top: rect.top - PAD - 34,
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
          position: 'absolute', bottom: -7, left: '50%',
          transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
          borderTop: '7px solid #c89a1e',
        }} />
      </div>
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  /** True once the main step-by-step tutorial has been dismissed */
  mainDone: boolean
  /** Callback when this sequence is fully dismissed */
  onDismiss?: () => void
}

export default function EventTutorial({ mainDone, onDismiss }: Props) {
  const { state, selectTool } = useSimulation()

  const isTouch = React.useMemo(() =>
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0), [])

  // ── Sequence state ────────────────────────────────────────────────────────
  const [activeSeq, setActiveSeq] = React.useState<SeqStep[] | null>(null)
  const [stepIdx,   setStepIdx]   = React.useState(0)
  const [dismissed, setDismissed] = React.useState(false)

  // Track which sequences have already fired this session
  const firedRef = React.useRef<Set<string>>(new Set())

  const advance = React.useCallback(() => {
    setStepIdx(i => {
      if (!activeSeq) return i
      if (i + 1 >= activeSeq.length) return i  // handled by done check below
      return i + 1
    })
  }, [activeSeq])

  // ── Trigger: unemployment detected after main tutorial done ───────────────
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

  // ── Auto-advance logic ────────────────────────────────────────────────────
  const advTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduledRef = React.useRef(-1)

  React.useEffect(() => {
    if (!activeSeq || dismissed) return
    const step = activeSeq[stepIdx]
    if (!step || step.manual) return
    if (scheduledRef.current === stepIdx) return

    const id = step.id
    let done = false

    if      (id === 'notice-badge' || id === 'open-stats')
      done = !document.querySelector('.stats-panel.collapsed')
    else if (id === 'open-advice')
      done = !!document.querySelector('[data-tutorial="advice-panel"] .ant-collapse-item-active')
    else if (id === 'close-stats')
      done = !!document.querySelector('.stats-panel.collapsed')
    else if (id === 'open-building')
      done = !!(window as any).__BUILDING_DRAWER_OPEN__
    else if (id === 'select-farm-tab')
      done = state.selectedTool === 'farmZone' || state.selectedTool === 'teaZone'
    else if (id === 'place-farm')
      done = state.farmZones.length > 0
    else if (id === 'connect-farm-road') {
      done = state.farmZones.some(z =>
        [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) =>
          state.roads.some(r => r.x === z.x + dx && r.y === z.y + dy)
        )
      )
    }

    if (!done) return
    scheduledRef.current = stepIdx
    if (advTimerRef.current) clearTimeout(advTimerRef.current)
    advTimerRef.current = setTimeout(() => {
      advTimerRef.current = null
      scheduledRef.current = -1
      setStepIdx(i => Math.min(i + 1, activeSeq.length - 1))
    }, 600)
  }) // runs every render — intentional (polls DOM state)

  React.useEffect(() => { scheduledRef.current = -1 }, [stepIdx])
  React.useEffect(() => () => { if (advTimerRef.current) clearTimeout(advTimerRef.current) }, [])

  // ── Switch to road tool for connect-farm-road step ────────────────────────
  const step = activeSeq?.[stepIdx] ?? null
  React.useEffect(() => {
    if (step?.id === 'connect-farm-road') selectTool('pan')
  }, [step?.id]) // eslint-disable-line

  const handleDismiss = React.useCallback(() => {
    setDismissed(true)
    onDismiss?.()
  }, [onDismiss])

  const handleDone = React.useCallback(() => {
    setDismissed(true)
    onDismiss?.()
  }, [onDismiss])

  if (!activeSeq || dismissed || !step) return null

  const isDone    = step.id === 'done-farming'
  const isManual  = step.manual === true
  const stepBody  = (isTouch && step.bodyTouch) ? step.bodyTouch : step.body

  const showSpotlight = step.targetId &&
    !(step.hideSpotlight?.(state) ?? false)

  return (
    <>
      {showSpotlight && <Spotlight targetId={step.targetId!} />}

      {/* ── Instruction panel ── */}
      <div style={{
        position: 'fixed',
        bottom: 24, left: 16,
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
        <div style={{
          fontSize: 13, color: 'rgba(220,195,145,0.88)',
          lineHeight: 1.85, letterSpacing: '0.04em', whiteSpace: 'pre-line',
        }}>
          {stepBody}
        </div>
        {/* Footer */}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {isDone ? (
            <button onClick={handleDone} style={{
              background: 'rgba(80,160,50,0.35)', border: '1px solid rgba(120,200,90,0.7)',
              borderRadius: 4, padding: '6px 24px', color: '#aaee98',
              fontFamily: '"Noto Serif SC", serif', fontSize: 13,
              letterSpacing: '0.2em', cursor: 'pointer',
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
                  fontFamily: '"Noto Serif SC", serif', fontSize: 13,
                  letterSpacing: '0.2em', cursor: 'pointer',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(160,115,35,0.6)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(130,95,25,0.4)')}
                >继续 →</button>
              )}
              {!isManual && (
                <span style={{ fontSize: 11, color: 'rgba(160,130,70,0.4)', letterSpacing: '0.07em' }}>
                  完成操作后自动进入下一步…
                </span>
              )}
              <button onClick={advance} style={{
                background: 'transparent', border: '1px solid rgba(160,130,60,0.28)',
                borderRadius: 3, padding: '3px 10px', color: 'rgba(180,150,80,0.55)',
                fontFamily: '"Noto Serif SC", serif', fontSize: 11,
                letterSpacing: '0.1em', cursor: 'pointer',
              }}
                onMouseEnter={e => { e.currentTarget.style.color = 'rgba(220,185,100,0.85)'; e.currentTarget.style.borderColor = 'rgba(200,160,70,0.5)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(180,150,80,0.55)'; e.currentTarget.style.borderColor = 'rgba(160,130,60,0.28)' }}
              >略过此步</button>
            </div>
          )}
          <button onClick={handleDismiss} style={{
            background: 'transparent', border: '1px solid rgba(140,110,55,0.22)',
            borderRadius: 3, padding: '3px 12px', color: 'rgba(150,120,65,0.4)',
            fontFamily: '"Noto Serif SC", serif', fontSize: 11,
            letterSpacing: '0.1em', cursor: 'pointer',
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
      `}</style>
    </>
  )
}

