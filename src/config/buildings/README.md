# src/config/buildings

每个建筑独占一个子目录，目录名即为建筑 ID（与代码中的 `BuildingType` 保持一致）。

## 目录结构

```
buildings/
  _schema.ts          ← TypeScript 类型定义（BuildingConfig / AddonConfig）
  _loader.ts          ← Vite glob 动态加载器，导出 BUILDING_REGISTRY / ADDON_REGISTRY
  {buildingId}/
    config.json       ← 建筑元数据（必须）
    icon.svg          ← UI 面板图标（可选，SVG 矢量图）
    model.glb         ← 3D 渲染模型（可选，glTF Binary）
    texture.png       ← 材质贴图（可选）
    addons/
      {addonId}/
        config.json   ← AddOn 元数据（必须）
        icon.svg      ← AddOn 图标（可选）
        model.glb     ← AddOn 3D 模型（可选）
        texture.png   ← AddOn 贴图（可选）
```

## config.json 关键字段

| 字段 | 说明 |
|------|------|
| `id` | 建筑唯一标识，与目录名一致 |
| `label` | 中文名称 |
| `labelEn` | 英文名称 |
| `category` | `residential` / `commercial` / `industrial` / `cultural` / `civic` / `storage` |
| `tier` | 解锁层级（1 = 游戏初始可用） |
| `cost` | 建造费用（文） |
| `maintenanceCostPerMonth` | 每月维护费（文） |
| `footprint` | 占地格子 `{"w":1,"h":1}`，寺庙为 `{"w":2,"h":2}` |
| `jobs` | 职业插槽列表，每项含 `jobId`（引用 `jobs/{id}`）与 `slots` |
| `prerequisites` | 前置条件：周边建筑、人口、资金、科技、地形 |
| `inputs` | 消耗品（引用 `goods/{id}`），含每日消耗量 |
| `outputs` | 产出品（引用 `goods/{id}`），含每日产量 |
| `addons` | 可挂载的 AddOn ID 列表（对应 `addons/` 子目录） |
| `serviceRadius` | 服务覆盖半径（格），0 表示无区域覆盖 |
| `needBonus` | 每 tick 对周边居民 `food`/`safety`/`culture` 的加成 |

## AddOn 说明

- 每个 AddOn **独占相邻的一个格子**（`footprint` 单独定义）
- AddOn 挂载后提供额外工位（`extraWorkerSlots`）和额外产出
- AddOn 可有独立前置条件（人口、资金、科技节点）
- 同一建筑可挂多个 AddOn，各占不同相邻格子

## 渲染资产说明

### 现状（程序化几何体）
目前所有建筑的 3D 外观都定义在 `src/scene/MapScene.tsx` 中，使用 Three.js 原始几何体
（`BoxGeometry`、`ConeGeometry` 等）拼装而成，例如：

```
BlacksmithMesh  ← box 主体 + 烟囱 + 炉火 emissive glow
MineMesh        ← box 主体 + 矿洞入口 + 矿石堆 + 木架支撑
TempleMesh      ← 台基 + box 主殿 + cone 屋顶 + 尖顶
```

`config.json` 里的 `renderAssets.model / texture / iconSvg` **目前是空占位路径**，
对应的文件尚不存在。

### 目标（GLB 资产管线）
当美术提供模型后，工作流为：

1. 将 `model.glb` 放入对应建筑文件夹，例如：
   `src/config/buildings/blacksmith/model.glb`
2. 在 `MapScene.tsx` 的 `<BuildingRenderer>` 里优先用 `useGLTF` 加载 GLB，
   若文件不存在则 fallback 回程序化 Mesh（已实现，见 `useBuildingModel` hook）
3. 贴图放同级 `texture.png`，UI 图标放同级 `icon.svg`

### 资产规格建议
| 文件 | 格式 | 多边形上限 | 说明 |
|------|------|-----------|------|
| `model.glb` | glTF 2.0 Binary | 500 tri | 含材质，Y-up，1 tile = 1 unit |
| `texture.png` | PNG, 512×512 | — | PBR Albedo，与 GLB 内嵌贴图一致 |
| `icon.svg` | SVG | — | 单色线稿，用于 HUD 建筑按钮 |

## 新增建筑

1. 在 `buildings/` 下创建 `{buildingId}/config.json`
2. 将 `id` 与目录名保持一致
3. `_loader.ts` 通过 `import.meta.glob` 自动检测，**无需手动注册**
4. 若需 AddOn，在 `{buildingId}/addons/{addonId}/config.json` 中定义

