import type { LevelDef } from '../levelsData'

const l09: LevelDef = {
  id: 'l09',
  order: 9,
  title: '千秋大典',
  subtitle: 'Grand Ceremony',
  description: '宋靖宗巡幸燕京，你需让全城人口、税收、文教均达到历史高点。',
  prerequisites: ['l07', 'l08'],
  col: 1, row: 4,

  mapBounds: { minX: -49, maxX: 49, minY: -49, maxY: 49 },

  allowedBuildings: [
    'house', 'manor', 'granary', 'market',
    'blacksmith', 'mine', 'lumbercamp',
    'academy', 'papermill', 'watchpost',
  ],

  objectives: [
    { kind: 'population',   target: 1000 },
    { kind: 'satisfaction', target: 88 },
    { kind: 'money',        target: 300000 },
  ],
}

export default l09

