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
    foothillChance: 0.02,
    foothillRadius: 2
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
