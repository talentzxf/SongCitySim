const worldGenConfig = {
  mapSizeX: 180,
  mapSizeY: 135,
  river: {
    branchMin: 6,
    branchMax: 10,
    maxLength: 520,
    minLength: 2,
    protectRadius: 40,
    attemptLimit: 5000,
    snapDist: 12,
    accFactor: 0.003,
    baseMultiplier: 12
  },
  road: {
    mountainCost: 160,
    mountainCostMultiplier: 3,
    allowOnMountains: true,
    mountainPerTileCost: 120
  },
  building: {
    mountainMultiplier: 3
  },
  ore: {
    mountainVeins:  7,      // 山地矿脉簇数量（固定个数，不按面积比例）
    foothillVeins:  3,      // 丘陵额外矿脉簇数量
    veinRadius:     2,      // 每簇半径（格）
    veinFill:       0.50,   // 簇内随机填充概率
  },
  forest: {
    clusters:    22,    // 树林簇数量（更多林地）
    radius:       5,    // 每簇半径（格）
    fill:        0.65,
    minDistCity:  12,
  },
  grassland: {
    clusters:    18,    // 草地簇数量（更多草地，供将来放牧）
    radius:       6,    // 每簇半径（格）
    fill:        0.55,
    minDistCity:  10,
  },
  mountain: {
    tileScale: 1.5,   // visual tile scale for mountains (increase to make mountains taller)
    amplify: 2.0,     // heightmap amplification factor (stronger)
    threshold: 0.56
  },
  walker: {
    mountainSpeedFactor: 0.6,
    mountainTileCost: 4
  },
  city: {
    flatInner: 8,
    flatOuter: 20,
    shape: 'blob',
    blobFreq: 0.06,
    blobThreshold: 0.5,
    protectPadding: 2,
    noiseWeight: 0.7,
    radialK: 0.9,
    smoothRadius: 3
  }
}

export default worldGenConfig
