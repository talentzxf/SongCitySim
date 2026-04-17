import type { LevelDef } from '../levelsData'

const l02: LevelDef = {
  id: 'l02',
  order: 2,
  title: '屯田积粮',
  subtitle: 'Fields & Granaries',
  description: '开垦荒地，广辟农田，确保县城粮食自给有余。',
  prerequisites: ['l01'],
  col: 0, row: 1,

  mapBounds: { minX: -20, maxX: 19, minY: -20, maxY: 19 },

  allowedBuildings: ['house', 'granary', 'market', 'lumbercamp'],

  objectives: [
    { kind: 'population', target: 200 },
    { kind: 'money',      target: 20000 },
  ],
}

export default l02

