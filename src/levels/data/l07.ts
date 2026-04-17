import type { LevelDef } from '../levelsData'

const l07: LevelDef = {
  id: 'l07',
  order: 7,
  title: '百工兴业',
  subtitle: 'Industry Boom',
  description: '引导工匠聚居，扶持瓷器、丝织、印刷等百业并举。',
  prerequisites: ['l04', 'l05'],
  col: 0, row: 3,

  mapBounds: { minX: -35, maxX: 34, minY: -35, maxY: 34 },

  allowedBuildings: ['house', 'manor', 'granary', 'market', 'blacksmith', 'mine', 'lumbercamp', 'papermill', 'watchpost'],

  objectives: [
    { kind: 'population', target: 600 },
    { kind: 'money',      target: 120000 },
  ],
}

export default l07

