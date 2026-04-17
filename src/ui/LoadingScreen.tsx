import React from 'react'

interface Props {
  visible: boolean
  onEnter: (mode: 'campaign' | 'sandbox' | 'load') => void
}

const FLAVOR_LINES = [
  '东京梦华，百万人家，灯火不歇。',
  '汴河漕运，万艘齐发，富甲天下。',
  '市井繁华，夜市连晓，笙歌不绝。',
  '一城烟火，半壁江山，皆在此间。',
  '千里江山，尽付匠心，城以人兴。',
]

const BUTTONS: { label: string; sub: string; mode: 'campaign' | 'sandbox' | 'load' }[] = [
  { label: '闯关征途', sub: 'Campaign', mode: 'campaign' },
  { label: '自由建造', sub: 'Sandbox',  mode: 'sandbox'  },
  { label: '载入存档', sub: 'Load Save', mode: 'load'    },
]

export default function LoadingScreen({ visible, onEnter }: Props) {
  const [dots, setDots] = React.useState(0)
  const [flavorIdx] = React.useState(() => Math.floor(Math.random() * FLAVOR_LINES.length))
  const [fading, setFading] = React.useState(false)
  const [gone, setGone] = React.useState(false)
  const [hovered, setHovered] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!visible) return
    const id = setInterval(() => setDots(d => (d + 1) % 4), 500)
    return () => clearInterval(id)
  }, [visible])

  const handleEnter = (mode: 'campaign' | 'sandbox' | 'load') => {
    setFading(true)
    setTimeout(() => { setGone(true); onEnter(mode) }, 800)
  }

  if (gone) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      opacity: fading ? 0 : 1,
      transition: 'opacity 0.8s ease',
      pointerEvents: fading ? 'none' : 'auto',
    }}>
      {/* Cover image */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${import.meta.env.BASE_URL}resource/image/cover.png)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        filter: 'brightness(0.68)',
      }} />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 25%, rgba(6,4,1,0.6) 100%)',
      }} />

      {/* Bottom fade */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%',
        background: 'linear-gradient(to top, rgba(5,3,1,0.92) 0%, transparent 100%)',
      }} />

      {/* Main content */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-end',
        paddingBottom: '6vh',
        gap: 0,
      }}>

        {/* Title — two-line stacked */}
        <div style={{
          fontFamily: '"Noto Serif SC", "Source Han Serif", "SimSun", serif',
          textAlign: 'center',
          marginBottom: '0.6em',
        }}>
          <div style={{
            fontSize: 'clamp(38px, 5.5vw, 68px)',
            fontWeight: 900,
            letterSpacing: '0.35em',
            color: '#f5e4be',
            textShadow: '0 0 50px rgba(210,160,60,0.65), 0 2px 10px rgba(0,0,0,0.95)',
            lineHeight: 1.15,
          }}>永宋千秋</div>
          <div style={{
            fontSize: 'clamp(22px, 3vw, 40px)',
            fontWeight: 700,
            letterSpacing: '0.5em',
            color: '#d4a85a',
            textShadow: '0 0 30px rgba(190,140,50,0.5), 0 2px 8px rgba(0,0,0,0.9)',
            lineHeight: 1.4,
          }}>城筑天下</div>
        </div>

        {/* Flavor quote */}
        <div style={{
          fontFamily: '"Noto Serif SC", serif',
          fontSize: 'clamp(11px, 1.1vw, 14px)',
          color: 'rgba(220,195,145,0.65)',
          letterSpacing: '0.18em',
          textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          marginBottom: '2.6em',
        }}>
          {FLAVOR_LINES[flavorIdx]}
        </div>

        {/* Buttons or loading spinner */}
        {visible ? (
          <div style={{ display: 'flex', gap: 'clamp(12px, 2vw, 24px)', alignItems: 'stretch' }}>
            {BUTTONS.map(btn => {
              const isHov = hovered === btn.mode
              return (
                <button
                  key={btn.mode}
                  onClick={() => handleEnter(btn.mode)}
                  onMouseEnter={() => setHovered(btn.mode)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    background: isHov ? 'rgba(160,115,40,0.22)' : 'rgba(0,0,0,0.3)',
                    border: `1px solid ${isHov ? 'rgba(220,175,90,0.9)' : 'rgba(180,140,65,0.5)'}`,
                    borderRadius: 2,
                    padding: 'clamp(10px,1.2vh,14px) clamp(20px,2.8vw,40px)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    boxShadow: isHov ? '0 0 28px rgba(190,140,50,0.3)' : 'none',
                    backdropFilter: 'blur(4px)',
                    minWidth: 'clamp(90px,8vw,120px)',
                  }}
                >
                  <span style={{
                    fontFamily: '"Noto Serif SC", serif',
                    fontSize: 'clamp(14px, 1.6vw, 18px)',
                    fontWeight: 700,
                    letterSpacing: '0.35em',
                    color: isHov ? '#f5e0a0' : '#ddc880',
                    textShadow: '0 1px 4px rgba(0,0,0,0.7)',
                  }}>{btn.label}</span>
                  <span style={{
                    fontSize: 10,
                    letterSpacing: '0.15em',
                    color: isHov ? 'rgba(220,190,120,0.7)' : 'rgba(180,155,90,0.45)',
                    fontFamily: 'monospace',
                    textTransform: 'uppercase',
                  }}>{btn.sub}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 32, height: 32,
              border: '2px solid rgba(190,150,70,0.4)',
              borderTopColor: '#b8902a',
              borderRadius: '50%',
              animation: 'ls-spin 0.9s linear infinite',
            }} />
            <div style={{
              color: 'rgba(190,160,100,0.6)',
              fontSize: 12,
              letterSpacing: '0.4em',
              fontFamily: 'serif',
            }}>
              {'筹备中' + '.'.repeat(dots)}
            </div>
          </div>
        )}

        <div style={{
          position: 'absolute', bottom: 14, right: 18,
          color: 'rgba(160,140,100,0.35)',
          fontSize: 10,
          letterSpacing: '0.08em',
          fontFamily: 'monospace',
        }}>
          Early Access
        </div>
      </div>

      <style>{`@keyframes ls-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
