/**
 * FarmLayer — farm zone ground, crop piles, and farmers at work.
 */
import React from 'react'
import * as THREE from 'three'
import FarmerAtWork from '../config/jobs/farmer/mesh'
import { FlatInstances, VariableHeightFlatInstances } from './MapPrimitives'
import { tileH } from '../config/characters/_shared'
import { isMountainAt } from '../state/worldgen'

// ─── Crop colour by growth stage ──────────────────────────────────────────

function getFarmColor(cropType: string, progress: number): THREE.Color {
  if (progress < 0.08) return new THREE.Color('#c8a060')   // 刚播种：浅暖棕（沃土）
  if (progress < 0.38) return new THREE.Color('#88d050')   // 幼苗：鲜嫩绿
  if (progress < 0.72) {
    const mid: Record<string, string> = {
      rice:      '#50b840',   // 水稻：明亮中绿
      millet:    '#90b830',   // 粟：黄绿
      wheat:     '#aab030',   // 麦：浅橄榄绿
      soybean:   '#40b060',   // 大豆：清绿
      vegetable: '#30b850',   // 蔬菜：翠绿
    }
    return new THREE.Color(mid[cropType] ?? '#50b840')
  }
  const ripe: Record<string, string> = {
    rice:      '#e8c040',   // 水稻成熟：金黄
    millet:    '#e09028',   // 粟成熟：橙黄
    wheat:     '#c8a028',   // 麦成熟：深金
    soybean:   '#b8b838',   // 大豆成熟：黄绿
    vegetable: '#60c840',   // 蔬菜成熟：鲜绿
  }
  return new THREE.Color(ripe[cropType] ?? '#e8c040')
}

function getTeaColor(progress: number): THREE.Color {
  if (progress < 0.08) return new THREE.Color('#a87840')   // 茶苗初植：浅棕
  if (progress < 0.38) return new THREE.Color('#3aaa48')   // 嫩茶：亮绿
  if (progress < 0.72) return new THREE.Color('#2a9040')   // 中期：中绿
  return new THREE.Color('#1a6830')                         // 成熟茶园：深绿
}

// ─── Grain field coloured ground ──────────────────────────────────────────

function GrainFieldInstances({ zones }: { zones: Array<{ x: number; y: number; cropType: string; growthProgress: number }> }) {
  const ref = React.useRef<THREE.InstancedMesh>(null)
  const items = React.useMemo(() => {
    const out: Array<{ x: number; y: number; color: THREE.Color }> = []
    for (const z of zones)
      for (let dx = 0; dx <= 1; dx++)
        for (let dy = 0; dy <= 1; dy++)
          out.push({ x: z.x + dx, y: z.y + dy, color: getFarmColor(z.cropType, z.growthProgress) })
    return out
  }, [zones])
  React.useLayoutEffect(() => {
    if (!ref.current || !items.length) return
    const mesh = ref.current; const tmp = new THREE.Object3D()
    mesh.count = items.length
    for (let i = 0; i < items.length; i++) {
      tmp.position.set(items[i].x, 0.062, items[i].y); tmp.rotation.set(-Math.PI / 2, 0, 0)
      tmp.scale.set(1, 1, 1); tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix); mesh.setColorAt(i, items[i].color)
    }
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [items])
  if (!items.length) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(items.length, 1)]} frustumCulled={false}>
      <planeGeometry args={[0.96, 0.96]} />
      <meshBasicMaterial />
    </instancedMesh>
  )
}

// ─── Tea garden coloured ground (rendered at mountain height) ─────────────

function TeaGardenInstances({ zones }: { zones: Array<{ x: number; y: number; growthProgress: number }> }) {
  const ref = React.useRef<THREE.InstancedMesh>(null)
  const items = React.useMemo(() => {
    const out: Array<{ x: number; y: number; h: number; color: THREE.Color }> = []
    for (const z of zones)
      for (let dx = 0; dx <= 1; dx++)
        for (let dy = 0; dy <= 1; dy++) {
          const tx = z.x + dx, ty = z.y + dy
          out.push({ x: tx, y: ty, h: tileH(tx, ty) + 0.010, color: getTeaColor(z.growthProgress) })
        }
    return out
  }, [zones])
  React.useLayoutEffect(() => {
    if (!ref.current || !items.length) return
    const mesh = ref.current; const tmp = new THREE.Object3D()
    mesh.count = items.length
    for (let i = 0; i < items.length; i++) {
      tmp.position.set(items[i].x, items[i].h, items[i].y); tmp.rotation.set(-Math.PI / 2, 0, 0)
      tmp.scale.set(1, 1, 1); tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix); mesh.setColorAt(i, items[i].color)
    }
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [items])
  if (!items.length) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(items.length, 1)]} frustumCulled={false}>
      <planeGeometry args={[0.96, 0.96]} />
      <meshBasicMaterial />
    </instancedMesh>
  )
}

// ─── Crop piles ────────────────────────────────────────────────────────────

function FarmPileInstances({ piles }: { piles: Array<{ x: number; y: number; cropType?: string }> }) {
  if (!piles.length) return null
  const PILE_COLOR: Record<string, string> = { rice: '#d4a820', millet: '#d89030', wheat: '#c89028', soybean: '#b0b840', vegetable: '#60a040', tea: '#4a8040' }
  return (
    <group>
      {piles.map((p, i) => {
        const col = PILE_COLOR[(p as any).cropType ?? 'rice'] ?? '#d4a820'
        return (
          <group key={i} position={[p.x + 0.5, 0.065, p.y - 0.1]}>
            <mesh position={[0, 0.1, 0]} castShadow>
              <cylinderGeometry args={[0.2, 0.26, 0.16, 8]} /><meshStandardMaterial color={col} />
            </mesh>
            <mesh position={[0, 0.24, 0]}>
              <coneGeometry args={[0.16, 0.18, 8]} /><meshStandardMaterial color={col} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

// ─── Public layer component ────────────────────────────────────────────────

export interface FarmerItem { id: string; x: number; y: number; seed: number }

export interface FarmLayerProps {
  farmZones: Array<{ x: number; y: number; cropType: string; growthProgress: number; zoneType?: string }>
  selectedFarmZoneTiles: Array<{ x: number; y: number }>
  farmersAtFarm: FarmerItem[]
  farmPiles: Array<{ x: number; y: number; cropType?: string }>
  selectedCitizenId: string | null
  onFarmerClick: (id: string, e: any) => void
}

export function FarmLayer({ farmZones, selectedFarmZoneTiles, farmersAtFarm, farmPiles, selectedCitizenId, onFarmerClick }: FarmLayerProps) {
  const grainZones = React.useMemo(() => farmZones.filter(z => (z.zoneType ?? 'grain') !== 'tea'), [farmZones])
  const teaZones   = React.useMemo(() => farmZones.filter(z => z.zoneType === 'tea'), [farmZones])

  // 选中农田高亮：山地茶园在山顶高度渲染
  const hasMtnSelection = selectedFarmZoneTiles.some(t => isMountainAt(t.x, t.y))
  const mtnHighlightItems = React.useMemo(() =>
    hasMtnSelection
      ? selectedFarmZoneTiles.map(t => ({ x: t.x, y: t.y, h: tileH(t.x, t.y) + 0.012 }))
      : [],
    [selectedFarmZoneTiles, hasMtnSelection],
  )

  return (
    <>
      {grainZones.length > 0 && <GrainFieldInstances zones={grainZones} />}
      {teaZones.length  > 0 && <TeaGardenInstances   zones={teaZones}  />}
      {hasMtnSelection
        ? <VariableHeightFlatInstances items={mtnHighlightItems} size={[0.90, 0.90]} color="#52c41a" opacity={0.50} />
        : selectedFarmZoneTiles.length > 0 && <FlatInstances items={selectedFarmZoneTiles} y={0.068} size={[0.90, 0.90]} color="#52c41a" opacity={0.50} />
      }
      {farmersAtFarm.map(f => (
        <FarmerAtWork key={f.id} x={f.x} y={f.y} seed={f.seed}
          selected={selectedCitizenId === f.id}
          onClick={(e: any) => onFarmerClick(f.id, e)} />
      ))}
      <FarmPileInstances piles={farmPiles} />
    </>
  )
}

