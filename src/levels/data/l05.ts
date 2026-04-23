import type { LevelDef } from '../levelsData'

const l05: LevelDef = {
  id: 'l05',
  order: 5,
  title: '修缮城防',
  subtitle: 'City Walls',
  description: '加固城墙，修建瓮城与敌楼，抵御北方游骑的侵扰。',
  prerequisites: ['l02', 'l03'],
  col: 1, row: 2,

  mapBounds: { minX: -25, maxX: 24, minY: -25, maxY: 24 },

  allowedBuildings: ['house', 'manor', 'granary', 'market', 'watchpost', 'blacksmith', 'farmZone', 'teaZone'],

  objectives: [
    { kind: 'satisfaction', target: 75 },
    { kind: 'population',   target: 350 },
    { kind: 'noDeath' },
  ],
}

export default l05

