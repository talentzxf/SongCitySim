import type { LevelDef } from '../levelsData'

const l08: LevelDef = {
  id: 'l08',
  order: 8,
  title: '繁华坊市',
  subtitle: 'The Grand Bazaar',
  description: '建立夜市与大型市集，让燕云成为北方商贸重镇。',
  prerequisites: ['l05', 'l06'],
  col: 2, row: 3,

  mapBounds: { minX: -35, maxX: 34, minY: -35, maxY: 34 },

  allowedBuildings: ['house', 'manor', 'granary', 'market', 'academy', 'papermill', 'blacksmith', 'watchpost'],

  objectives: [
    { kind: 'satisfaction', target: 85 },
    { kind: 'population',   target: 600 },
  ],
}

export default l08

