/**
 * LevelContext — provides the active level definition to all components.
 * null = sandbox / free-build mode (no restrictions).
 */
import React from 'react'
import type { LevelDef } from './levelsData'

interface LevelContextValue {
  level: LevelDef | null   // null → sandbox
  cityName: string
}

const LevelContext = React.createContext<LevelContextValue>({ level: null, cityName: '新城' })

export function LevelProvider({
  level, cityName, children,
}: { level: LevelDef | null; cityName: string; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ level, cityName }), [level, cityName])
  return <LevelContext.Provider value={value}>{children}</LevelContext.Provider>
}

export function useLevelContext() {
  return React.useContext(LevelContext)
}

