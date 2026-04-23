import type { LevelDef } from '../levelsData'

const l01: LevelDef = {
  id: 'l01',
  order: 1,
  title: '燕云初定',
  subtitle: 'Dawn of Yanyun',
  description: '岳飞克复燕京，你奉旨赴燕云就地筑城，从零开始建立县治。',
  prerequisites: [],
  col: 1, row: 0,
  hasIntro: true,

  // 30×30 小地块，紧邻入城驿道
  mapBounds: { minX: -15, maxX: 14, minY: -15, maxY: 14 },

  // 初来乍到，只能建最基础的民生设施
  allowedBuildings: ['house', 'granary', 'market', 'farmZone', 'teaZone'],

  objectives: [
    { kind: 'population', target: 100 }, // 达到百人县治规模
    { kind: 'noDeath' },                 // 初定之地不能让百姓枉死
  ],
}

export default l01

