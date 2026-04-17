import type { LevelDef } from '../levelsData'

const l03: LevelDef = {
  id: 'l03',
  order: 3,
  title: '商贸通衢',
  subtitle: 'Trade Routes',
  description: '开辟商道，招徕行商，让财富流入新城。',
  prerequisites: ['l01'],
  col: 2, row: 1,

  mapBounds: { minX: -20, maxX: 19, minY: -20, maxY: 19 },

  allowedBuildings: ['house', 'manor', 'granary', 'market'],

  objectives: [
    { kind: 'satisfaction', target: 70 },
    { kind: 'population',   target: 200 },
  ],
}

export default l03

