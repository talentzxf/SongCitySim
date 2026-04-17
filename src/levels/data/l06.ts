import type { LevelDef } from '../levelsData'

const l06: LevelDef = {
  id: 'l06',
  order: 6,
  title: '外交折冲',
  subtitle: 'Diplomacy',
  description: '接待周边部族使者，以礼与利化干戈为玉帛。',
  prerequisites: ['l03'],
  col: 2, row: 2,

  mapBounds: { minX: -25, maxX: 24, minY: -25, maxY: 24 },

  allowedBuildings: ['house', 'manor', 'granary', 'market', 'academy', 'papermill'],

  objectives: [
    { kind: 'satisfaction', target: 80 },
    { kind: 'money',        target: 60000 },
  ],
}

export default l06

