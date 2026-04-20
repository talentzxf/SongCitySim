import React from 'react'

// ─── Cinematic slides for Level 1 ────────────────────────────────────────────
const SLIDES: { text: string; sub?: string }[] = [
  {
    text: '謹識',
    sub: '很遗憾，本故事纯属虚构，发生于另一平行宇宙之中。\n历史人物借名登场，事迹皆为架空演绎，\n与真实历史全无关联，请勿对号入座。',
  },
  {
    text: '公元一一〇〇年',
    sub:
        '二十三岁的宋哲宗病而复生。' +
        '自此，大宋不再循旧路。' +
        '召苏轼，行新政，图强兵。' +
        '从此，历史走上了完全不同的另一分支',
  },
  {
    text: '公元一一二三年',
    sub: '哲宗崩，传位太子，是为宋靖宗。靖宗改元「定朔」，誓复燕云故土。',
  },
  {
    text: '定朔三年',
    sub: '北伐军出，中路都统制岳飞率铁骑直抵燕京城下。',
  },
  {
    text: '燕京光复',
    sub: '岳飞挥师克燕京，燕云十六州尽归宋土，山河重整，万民欢腾。',
  },
  {
    text: '诏书至',
    sub: '朝廷擢你为燕云新置县的首任知县，赴任就地筑城，安抚百姓，经营北疆。',
  },
  {
    text: '你，准备好了吗？',
    sub: '',
  },
]

// ─── Preset city name suggestions ─────────────────────────────────────────────
const CITY_SUGGESTIONS = [
  '定朔城', '靖北县', '北定城', '安朔城',
  '镇远城', '怀德县', '崇化城', '永清县',
]

interface Props {
  onConfirm: (cityName: string) => void
}

export default function LevelIntro({ onConfirm }: Props) {
  const [slide, setSlide] = React.useState(0)
  const [charIdx, setCharIdx] = React.useState(0)
  const [subCharIdx, setSubCharIdx] = React.useState(0)
  const [phase, setPhase] = React.useState<'title' | 'sub' | 'wait'>('title')
  const [fading, setFading] = React.useState(false)
  const [cityName, setCityName] = React.useState('')
  const [hoveredSug, setHoveredSug] = React.useState<string | null>(null)

  const current = SLIDES[slide]
  const isLast = slide === SLIDES.length - 1

  // Typewriter for title
  React.useEffect(() => {
    setCharIdx(0)
    setSubCharIdx(0)
    setPhase('title')
  }, [slide])

  React.useEffect(() => {
    if (phase === 'title') {
      if (charIdx < current.text.length) {
        const t = setTimeout(() => setCharIdx(c => c + 1), 80)
        return () => clearTimeout(t)
      } else {
        // title done → start sub after short pause
        const t = setTimeout(() => setPhase('sub'), 300)
        return () => clearTimeout(t)
      }
    }
  }, [phase, charIdx, current.text.length])

  React.useEffect(() => {
    if (phase === 'sub') {
      const sub = current.sub ?? ''
      if (subCharIdx < sub.length) {
        const t = setTimeout(() => setSubCharIdx(c => c + 1), 45)
        return () => clearTimeout(t)
      } else {
        setPhase('wait')
      }
    }
  }, [phase, subCharIdx, current.sub])

  const handleNext = () => {
    if (phase !== 'wait') {
      // Skip to end of current slide
      setCharIdx(current.text.length)
      setSubCharIdx((current.sub ?? '').length)
      setPhase('wait')
      return
    }
    if (isLast) return // handled by the Confirm button on last slide
    if (slide < SLIDES.length - 1) {
      setSlide(s => s + 1)
    }
  }

  const handleConfirm = () => {
    if (isLast && phase === 'wait') {
      const name = cityName.trim() || CITY_SUGGESTIONS[0]
      setFading(true)
      setTimeout(() => onConfirm(name), 700)
    }
  }


  return (
    <div
      onClick={!isLast ? handleNext : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: '#000',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.7s ease',
        cursor: !isLast ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        userSelect: 'none',
      }}
    >
      {/* Subtle texture overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(ellipse at 50% 40%, rgba(80,55,20,0.18) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Skip button — top right */}
      {!isLast && (
        <button
          onClick={e => { e.stopPropagation(); setSlide(SLIDES.length - 1) }}
          style={{
            position: 'absolute', top: 20, right: 24,
            background: 'rgba(60,40,10,0.7)',
            border: '1px solid rgba(200,160,70,0.55)',
            borderRadius: 4,
            padding: '7px 18px',
            color: 'rgba(220,185,100,0.9)',
            fontFamily: '"Noto Serif SC", serif',
            fontSize: 12, letterSpacing: '0.2em',
            cursor: 'pointer',
            transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            zIndex: 1,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(100,70,18,0.85)'
            e.currentTarget.style.borderColor = 'rgba(220,175,80,0.85)'
            e.currentTarget.style.color = '#f5e090'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(60,40,10,0.7)'
            e.currentTarget.style.borderColor = 'rgba(200,160,70,0.55)'
            e.currentTarget.style.color = 'rgba(220,185,100,0.9)'
          }}
        >跳过 ⏭</button>
      )}

      {/* Slide counter dots */}
      <div style={{ position: 'absolute', top: 32, display: 'flex', gap: 8 }}>
        {SLIDES.map((_, i) => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: i === slide ? 'rgba(210,170,80,0.9)' : 'rgba(180,150,80,0.25)',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>

      {/* Main title */}
      <div style={{
        fontFamily: '"Noto Serif SC", "Source Han Serif", "SimSun", serif',
        fontSize: 'clamp(26px, 4vw, 52px)',
        fontWeight: 900,
        letterSpacing: '0.4em',
        color: '#f0d98a',
        textShadow: '0 0 60px rgba(200,155,50,0.5), 0 2px 12px rgba(0,0,0,0.9)',
        marginBottom: '0.7em',
        minHeight: '1.4em',
        textAlign: 'center',
        padding: '0 1em',
      }}>
        {current.text.slice(0, charIdx)}
        <span style={{ opacity: phase === 'title' ? 1 : 0, transition: 'opacity 0.2s' }}>▌</span>
      </div>

      {/* Sub text */}
      <div style={{
        fontFamily: '"Noto Serif SC", serif',
        fontSize: 'clamp(13px, 1.4vw, 18px)',
        color: 'rgba(220,195,145,0.78)',
        letterSpacing: '0.12em',
        lineHeight: 1.9,
        textAlign: 'center',
        maxWidth: '56ch',
        padding: '0 2em',
        minHeight: '3em',
        textShadow: '0 1px 6px rgba(0,0,0,0.9)',
      }}>
        {(current.sub ?? '').slice(0, subCharIdx)}
        {phase === 'sub' && <span style={{ opacity: 0.7 }}>▌</span>}
      </div>

      {/* ── Last slide: city naming panel ── */}
      {isLast && phase === 'wait' && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            marginTop: '2.4em',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
            animation: 'intro-fadein 0.5s ease both',
          }}
        >
          {/* Label */}
          <div style={{
            fontFamily: '"Noto Serif SC", serif',
            fontSize: 13, letterSpacing: '0.3em',
            color: 'rgba(210,180,110,0.65)',
          }}>
            赐名新城
          </div>

          {/* Text input */}
          <input
            autoFocus
            maxLength={10}
            value={cityName}
            onChange={e => setCityName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
            placeholder={CITY_SUGGESTIONS[0]}
            style={{
              background: 'rgba(10,7,2,0.8)',
              border: '1px solid rgba(200,160,60,0.55)',
              borderRadius: 3,
              padding: '10px 20px',
              color: '#f5e090',
              fontFamily: '"Noto Serif SC", serif',
              fontSize: 'clamp(16px, 2vw, 22px)',
              letterSpacing: '0.4em',
              textAlign: 'center',
              width: 'clamp(180px, 22vw, 280px)',
              outline: 'none',
              caretColor: '#d4a840',
            }}
          />

          {/* Suggestions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 380 }}>
            {CITY_SUGGESTIONS.map(sug => {
              const isHov = hoveredSug === sug
              const isActive = cityName === sug
              return (
                <button
                  key={sug}
                  onClick={() => setCityName(sug)}
                  onMouseEnter={() => setHoveredSug(sug)}
                  onMouseLeave={() => setHoveredSug(null)}
                  style={{
                    background: isActive ? 'rgba(140,100,30,0.45)' : isHov ? 'rgba(80,60,20,0.4)' : 'rgba(20,14,5,0.6)',
                    border: `1px solid ${isActive ? 'rgba(220,175,75,0.8)' : 'rgba(160,125,50,0.35)'}`,
                    borderRadius: 2,
                    padding: '4px 14px',
                    color: isActive ? '#f5e090' : 'rgba(200,165,85,0.65)',
                    fontFamily: '"Noto Serif SC", serif',
                    fontSize: 12, letterSpacing: '0.2em',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {sug}
                </button>
              )
            })}
          </div>

          {/* Confirm button */}
          <button
            onClick={handleConfirm}
            style={{
              marginTop: 8,
              background: 'rgba(120,88,25,0.4)',
              border: '1px solid rgba(220,175,80,0.7)',
              borderRadius: 3,
              padding: '10px 40px',
              color: '#f5e090',
              fontFamily: '"Noto Serif SC", serif',
              fontSize: 15, letterSpacing: '0.4em',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(160,115,35,0.6)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(120,88,25,0.4)')}
          >
            开始筑城
          </button>
        </div>
      )}

      {/* Normal continue prompt (non-last slides) */}
      {!isLast && (
        <>
          <div style={{
            position: 'absolute', bottom: 40,
            color: 'rgba(190,160,90,0.55)',
            fontSize: 12, letterSpacing: '0.3em',
            fontFamily: '"Noto Serif SC", monospace',
            animation: phase === 'wait' ? 'intro-blink 1.4s ease-in-out infinite' : 'none',
            opacity: phase === 'wait' ? 1 : 0,
            transition: 'opacity 0.4s',
          }}>
            点击继续
          </div>
          <div style={{
            position: 'absolute', bottom: 70,
            width: 'clamp(120px, 20vw, 220px)', height: 1,
            background: 'linear-gradient(to right, transparent, rgba(190,155,70,0.4), transparent)',
            opacity: phase === 'wait' ? 1 : 0,
            transition: 'opacity 0.6s 0.2s',
          }} />
        </>
      )}

      <style>{`
        @keyframes intro-blink { 0%,100%{opacity:0.55} 50%{opacity:1} }
        @keyframes intro-fadein { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
      `}</style>
    </div>
  )
}






