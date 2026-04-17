import React from 'react'
import LEVELS, { LevelDef, LevelStatus, loadProgress, saveProgress, completeLevel } from './levelsData'

// Grid config
const CELL_W = 160
const CELL_H = 130
const COLS = 3
const ROWS = 5
const PAD_X = 60
const PAD_Y = 60
const SVG_W = COLS * CELL_W + PAD_X * 2
const SVG_H = ROWS * CELL_H + PAD_Y * 2

function nodeCenter(lvl: LevelDef): [number, number] {
  return [PAD_X + lvl.col * CELL_W + CELL_W / 2, PAD_Y + lvl.row * CELL_H + CELL_H / 2]
}

const STATUS_COLOR: Record<LevelStatus, string> = {
  locked:    'rgba(80,70,55,0.6)',
  available: 'rgba(190,150,55,0.9)',
  completed: 'rgba(100,170,90,0.9)',
}

const STATUS_BORDER: Record<LevelStatus, string> = {
  locked:    'rgba(100,85,60,0.4)',
  available: 'rgba(220,175,80,0.9)',
  completed: 'rgba(130,200,110,0.8)',
}

interface Props {
  /** Called when the user clicks an available level */
  onStartLevel: (levelId: string) => void
  /** Called when a level is completed externally – updates progress tree */
  onLevelComplete?: (levelId: string) => void
  /** Optional: called when Back button pressed */
  onBack?: () => void
}

export default function LevelSelect({ onStartLevel, onLevelComplete: _onLevelComplete, onBack }: Props) {
  const [progress, setProgress] = React.useState<Record<string, LevelStatus>>(() => loadProgress())
  const [hovered, setHovered] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<string | null>(null)

  // Persist whenever progress changes
  React.useEffect(() => { saveProgress(progress) }, [progress])

  // Exposed helper: call this after the player wins a level
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const markComplete = (id: string) => setProgress(prev => completeLevel(id, prev))

  const getStatus = (id: string): LevelStatus => progress[id] ?? 'locked'

  const handleClick = (lvl: LevelDef) => {
    const status = getStatus(lvl.id)
    if (status === 'locked') return
    setSelected(lvl.id)
    onStartLevel(lvl.id)
  }

  const selectedLvl = LEVELS.find(l => l.id === selected)
  void selectedLvl // unused after panel removal

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: '#0a0804',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      overflowY: 'auto',
    }}>
      {/* Background texture */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(100,70,20,0.25) 0%, transparent 60%)',
      }} />

      {/* Header */}
      <div style={{
        width: '100%', maxWidth: 820,
        padding: '32px 32px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative', zIndex: 1,
      }}>
        {onBack && (
          <button onClick={onBack} style={{
            background: 'transparent', border: '1px solid rgba(190,155,65,0.4)',
            borderRadius: 2, color: 'rgba(190,160,90,0.7)', padding: '6px 16px',
            fontFamily: '"Noto Serif SC", serif', fontSize: 12, letterSpacing: '0.2em',
            cursor: 'pointer',
          }}>← 返回</button>
        )}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{
            fontFamily: '"Noto Serif SC", "SimSun", serif',
            fontSize: 'clamp(20px, 2.5vw, 30px)',
            fontWeight: 900, letterSpacing: '0.4em',
            color: '#f0d580',
            textShadow: '0 0 40px rgba(200,155,50,0.4)',
          }}>闯关征途</div>
          <div style={{
            fontSize: 11, letterSpacing: '0.25em',
            color: 'rgba(180,145,70,0.5)', fontFamily: 'monospace',
            marginTop: 4,
          }}>CAMPAIGN</div>
        </div>
        <div style={{ minWidth: 80 }} />
      </div>

      {/* SVG tree */}
      <div style={{ position: 'relative', marginTop: 24, marginBottom: 16 }}>
        <svg
          width={SVG_W} height={SVG_H}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ display: 'block' }}
        >
          {/* Edges */}
          {LEVELS.map(lvl =>
            lvl.prerequisites.map(pid => {
              const parent = LEVELS.find(l => l.id === pid)
              if (!parent) return null
              const [x1, y1] = nodeCenter(parent)
              const [x2, y2] = nodeCenter(lvl)
              const parentDone = getStatus(pid) === 'completed'
              return (
                <line key={`${pid}-${lvl.id}`}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={parentDone ? 'rgba(130,200,110,0.35)' : 'rgba(140,110,50,0.25)'}
                  strokeWidth={parentDone ? 2 : 1.5}
                  strokeDasharray={parentDone ? undefined : '5 4'}
                />
              )
            })
          )}

          {/* Nodes */}
          {LEVELS.map(lvl => {
            const status = getStatus(lvl.id)
            const [cx, cy] = nodeCenter(lvl)
            const isHov = hovered === lvl.id
            const isSel = selected === lvl.id
            const W = 120, H = 72, rx = 5

            return (
              <g
                key={lvl.id}
                transform={`translate(${cx - W / 2},${cy - H / 2})`}
                style={{ cursor: status !== 'locked' ? 'pointer' : 'default' }}
                onClick={() => handleClick(lvl)}
                onMouseEnter={() => setHovered(lvl.id)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Shadow */}
                <rect x={2} y={3} width={W} height={H} rx={rx}
                  fill="rgba(0,0,0,0.45)" />

                {/* Card bg */}
                <rect width={W} height={H} rx={rx}
                  fill={isSel
                    ? 'rgba(130,95,30,0.55)'
                    : isHov && status !== 'locked'
                      ? 'rgba(80,60,20,0.55)'
                      : 'rgba(20,15,8,0.7)'}
                  stroke={isSel
                    ? 'rgba(240,200,90,0.9)'
                    : STATUS_BORDER[status]}
                  strokeWidth={isSel ? 1.5 : 1}
                />

                {/* Status pill */}
                <rect x={W - 26} y={6} width={20} height={10} rx={5}
                  fill={STATUS_COLOR[status]} />

                {/* Order badge */}
                <text x={10} y={20}
                  fill="rgba(190,155,70,0.5)"
                  fontSize={9} fontFamily="monospace" letterSpacing="0.1em">
                  {String(lvl.order).padStart(2, '0')}
                </text>

                {/* Title */}
                <text x={W / 2} y={38}
                  textAnchor="middle"
                  fill={status === 'locked' ? 'rgba(120,100,70,0.55)' : (isSel ? '#f5e090' : '#ddc870')}
                  fontSize={14}
                  fontFamily='"Noto Serif SC","SimSun",serif'
                  fontWeight="700"
                  letterSpacing="0.25em">
                  {lvl.title}
                </text>

                {/* Subtitle */}
                <text x={W / 2} y={54}
                  textAnchor="middle"
                  fill={status === 'locked' ? 'rgba(100,80,50,0.4)' : 'rgba(175,140,65,0.5)'}
                  fontSize={8}
                  fontFamily="monospace"
                  letterSpacing="0.15em">
                  {lvl.subtitle.toUpperCase()}
                </text>

                {/* Lock icon if locked */}
                {status === 'locked' && (
                  <text x={W / 2} y={H - 10}
                    textAnchor="middle"
                    fill="rgba(120,95,55,0.45)"
                    fontSize={10}>🔒</text>
                )}

                {/* Checkmark if completed */}
                {status === 'completed' && (
                  <text x={W / 2} y={H - 10}
                    textAnchor="middle"
                    fill="rgba(130,200,110,0.8)"
                    fontSize={10}>✓ 已通关</text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}





