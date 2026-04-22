/**
 * GameToast — slim bottom-center action-feedback toasts.
 * Less intrusive than top-center ant-design toasts; fits the game UI better.
 *
 * Usage (anywhere in the app, including R3F canvas context):
 *   window.__GAME_TOAST__?.({ type: 'warning', text: '资金不足' })
 *   window.__GAME_TOAST__?.({ type: 'success', text: '存档成功' })
 *   window.__GAME_TOAST__?.({ type: 'error',   text: '读档失败' })
 *   window.__GAME_TOAST__?.({ type: 'info',    text: '加载中…' })
 *   window.__GAME_TOAST__?.clear()   // dismiss all
 */
import React from 'react'

export interface ToastPayload {
  type: 'success' | 'warning' | 'error' | 'info'
  text: string
  /** auto-dismiss duration in ms, default 2800 */
  duration?: number
}

interface ToastItem extends ToastPayload {
  id: number
  exiting: boolean
}

const ACCENT: Record<ToastPayload['type'], string> = {
  success: '#52c41a',
  warning: '#faad14',
  error:   '#ff4d4f',
  info:    '#40a9ff',
}
const EMOJI: Record<ToastPayload['type'], string> = {
  success: '✓',
  warning: '⚠',
  error:   '✕',
  info:    'ℹ',
}

let _push:  ((t: ToastPayload) => void) | null = null
let _clear: (() => void) | null = null

/** Bridge exposed on window.__GAME_TOAST__ */
function bridge(payload: ToastPayload | { clear: true }) {
  if ('clear' in payload && payload.clear) { _clear?.(); return }
  _push?.(payload as ToastPayload)
}
bridge.clear = () => _clear?.()
;(window as any).__GAME_TOAST__ = bridge

// ── Single toast item ──────────────────────────────────────────────────────

function ToastChip({ item, onDone }: { item: ToastItem; onDone: (id: number) => void }) {
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    // Trigger enter animation
    const enter = requestAnimationFrame(() => setVisible(true))
    const duration = item.duration ?? 2800
    const exit = setTimeout(() => setVisible(false), duration)
    const remove = setTimeout(() => onDone(item.id), duration + 350)
    return () => {
      cancelAnimationFrame(enter)
      clearTimeout(exit)
      clearTimeout(remove)
    }
  }, []) // eslint-disable-line

  const accent = ACCENT[item.type]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      background: 'rgba(8,5,2,0.78)',
      border: `1px solid ${accent}55`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 6,
      padding: '6px 14px 6px 10px',
      fontFamily: '"Noto Serif SC","SimSun",serif',
      fontSize: 13,
      color: 'rgba(230,205,155,0.92)',
      boxShadow: '0 3px 16px rgba(0,0,0,0.55)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      pointerEvents: 'none',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(12px)',
      transition: 'opacity 0.25s ease, transform 0.25s ease',
      whiteSpace: 'nowrap',
      maxWidth: 'min(80vw, 420px)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }}>
      <span style={{ color: accent, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
        {EMOJI[item.type]}
      </span>
      <span>{item.text}</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

let _uid = 0

export default function GameToast() {
  const [items, setItems] = React.useState<ToastItem[]>([])

  const push = React.useCallback((payload: ToastPayload) => {
    const id = ++_uid
    setItems(prev => [...prev.slice(-2), { ...payload, id, exiting: false }]) // max 3 visible
  }, [])

  const clear = React.useCallback(() => setItems([]), [])
  const remove = React.useCallback((id: number) => setItems(prev => prev.filter(t => t.id !== id)), [])

  React.useEffect(() => {
    _push  = push
    _clear = clear
    ;(window as any).__GAME_TOAST__ = bridge
    return () => { _push = null; _clear = null }
  }, [push, clear])

  if (items.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 80,         // above toolbar
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 8900,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      pointerEvents: 'none',
    }}>
      {items.map(item => (
        <ToastChip key={item.id} item={item} onDone={remove} />
      ))}
    </div>
  )
}

