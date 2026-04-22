/**
 * GameHints — event-driven contextual hint bubbles.
 * Watches the simulation state and pops up brief explanatory tooltips
 * when notable game events occur (first migrant, first settler, sick citizen, etc.).
 * Each hint fires at most once per session (tracked in a Set).
 */
import React from 'react'
import { useSimulation } from '../state/simulation'

interface Hint {
  id: string
  emoji: string
  title: string
  body: string
  color?: string   // accent color
}

const HINT_DURATION_MS = 7000

// ── Individual hint bubble ─────────────────────────────────────────────────
function HintBubble({ hint, onClose }: { hint: Hint; onClose: () => void }) {
  React.useEffect(() => {
    const t = setTimeout(onClose, HINT_DURATION_MS)
    return () => clearTimeout(t)
  }, [onClose])

  const accent = hint.color ?? '#c8a040'

  return (
    <div style={{
      background: 'rgba(10,6,2,0.72)',
      border: `1px solid ${accent}88`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 8,
      padding: '10px 14px',
      boxShadow: '0 4px 18px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      fontFamily: '"Noto Serif SC","SimSun",serif',
      maxWidth: 300,
      animation: 'hint-in 0.3s ease',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 20, lineHeight: 1.2 }}>{hint.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginBottom: 3 }}>
            {hint.title}
          </div>
          <div style={{ fontSize: 11.5, color: 'rgba(220,195,145,0.88)', lineHeight: 1.7 }}>
            {hint.body}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: 'rgba(200,160,60,0.5)',
            cursor: 'pointer', fontSize: 14, padding: '0 0 0 4px', lineHeight: 1,
          }}
        >✕</button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function GameHints() {
  const { state } = useSimulation()
  const [queue, setQueue] = React.useState<Hint[]>([])
  const firedRef = React.useRef<Set<string>>(new Set())

  function fire(hint: Hint) {
    if (firedRef.current.has(hint.id)) return
    firedRef.current.add(hint.id)
    setQueue(q => [...q, hint])
  }

  function dismiss(id: string) {
    setQueue(q => q.filter(h => h.id !== id))
  }

  // Clear hints whenever a property panel opens
  React.useEffect(() => {
    const hasSelection = Boolean(
      state.selectedBuildingId || state.selectedCitizenId ||
      state.selectedFarmZoneId || state.selectedTerrainTile,
    )
    if (hasSelection) setQueue([])
  }, [state.selectedBuildingId, state.selectedCitizenId, state.selectedFarmZoneId, state.selectedTerrainTile]) // eslint-disable-line

  // ── Trigger: first migrant on the road ──────────────────────────────────
  React.useEffect(() => {
    if (state.migrants.length > 0) {
      fire({
        id: 'first-migrant',
        emoji: '🚶',
        title: '移民入城！',
        body: '有人正从城门走来。只要房子有路相连，他们就会自动安家。',
      })
    }
  }, [state.migrants.length > 0]) // eslint-disable-line

  // ── Trigger: first citizen settles ──────────────────────────────────────
  React.useEffect(() => {
    if (state.citizens.length === 1) {
      fire({
        id: 'first-citizen',
        emoji: '🏠',
        title: '第一位居民入住！',
        body: '点击住宅可查看居民详情，包括需求、满意度和职业。',
        color: '#52c41a',
      })
    }
  }, [state.citizens.length]) // eslint-disable-line

  // ── Trigger: first worker employed ──────────────────────────────────────
  React.useEffect(() => {
    const hasWorker = state.citizens.some(c => c.workplaceId !== null)
    if (hasWorker) {
      fire({
        id: 'first-worker',
        emoji: '⚒️',
        title: '居民开始上工',
        body: '居民会自动去附近有空位的工坊上班，每天早出晚归。',
        color: '#fa8c16',
      })
    }
  }, [state.citizens.some(c => c.workplaceId !== null)]) // eslint-disable-line

  // ── Trigger: any citizen gets sick ──────────────────────────────────────
  React.useEffect(() => {
    if (state.citizens.some(c => c.isSick)) {
      fire({
        id: 'first-sick',
        emoji: '🤒',
        title: '有居民生病了！',
        body: '生病会影响居民满意度。建造水井可以改善卫生，降低患病率。',
        color: '#ff4d4f',
      })
    }
  }, [state.citizens.some(c => c.isSick)]) // eslint-disable-line

  // ── Trigger: food in a granary runs critically low ───────────────────────
  React.useEffect(() => {
    const granaries = state.buildings.filter(b => b.type === 'granary')
    const anyLow = granaries.some(g => {
      const stock = Object.values((g as any).stock ?? {}).reduce((s: number, v) => s + (v as number), 0)
      return stock < 5 && granaries.length > 0
    })
    if (anyLow) {
      fire({
        id: 'granary-low',
        emoji: '🌾',
        title: '粮仓存粮告急',
        body: '请开辟更多粮田或茶园，并确保农夫有道路可以运粮进仓。',
        color: '#faad14',
      })
    }
  }, [state.buildings]) // eslint-disable-line

  // ── Trigger: first tax collected ────────────────────────────────────────
  React.useEffect(() => {
    if (state.lastMonthlyTax > 0) {
      fire({
        id: 'first-tax',
        emoji: '💰',
        title: '月末课税',
        body: `本月收入 ¥${Math.floor(state.lastMonthlyTax)}。点击右上角铜钱图标可调整税率。`,
        color: '#c8a040',
      })
    }
  }, [state.lastMonthlyTax > 0]) // eslint-disable-line

  // ── Trigger: citizens unhappy (avg satisfaction < 40) ───────────────────
  React.useEffect(() => {
    if (state.citizens.length >= 3) {
      const avg = state.citizens.reduce((s, c) => s + c.satisfaction, 0) / state.citizens.length
      if (avg < 40) {
        fire({
          id: 'low-satisfaction',
          emoji: '😟',
          title: '民心不稳',
          body: '居民满意度偏低。检查食物供给、安全感和文化需求，可在顾问面板查看详情。',
          color: '#ff4d4f',
        })
      }
    }
  }, [Math.floor((state.citizens.reduce((s, c) => s + c.satisfaction, 0) / Math.max(1, state.citizens.length)) / 10)]) // eslint-disable-line

  if (queue.length === 0) return null

  return (
    <>
      <style>{`
        @keyframes hint-in {
          from { opacity: 0; transform: translateX(30px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div style={{
        position: 'fixed',
        bottom: 110,
        right: 12,
        zIndex: 9000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
        alignItems: 'flex-end',
      }}>
        {queue.map(h => (
          <div key={h.id} style={{ pointerEvents: 'auto' }}>
            <HintBubble hint={h} onClose={() => dismiss(h.id)} />
          </div>
        ))}
      </div>
    </>
  )
}

