import type { LevelDef } from '../levelsData'

const l04: LevelDef = {
  id: 'l04',
  order: 4,
  title: '铸造兵器',
  subtitle: 'The Armoury',
  description: '建立铁冶与兵器坊，为北疆驻军提供军备。',
  prerequisites: ['l02'],
  col: 0, row: 2,

  mapBounds: { minX: -25, maxX: 24, minY: -25, maxY: 24 },

  allowedBuildings: ['house', 'manor', 'granary', 'market', 'blacksmith', 'mine', 'lumbercamp', 'farmZone', 'teaZone'],

  objectives: [
    { kind: 'population', target: 350 },
    { kind: 'money',      target: 50000 },
  ],
}

export default l04

