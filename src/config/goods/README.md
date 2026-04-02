# src/config/goods

每种商品/产品独占一个子目录，目录名即为货物 ID。

## 目录结构

```
goods/
  _schema.ts          ← TypeScript 类型定义（GoodsConfig）
  _loader.ts          ← Vite glob 动态加载器，导出 GOODS_REGISTRY
  {goodId}/
    config.json       ← 货物元数据（必须）
    icon.svg          ← UI 图标（可选）
    sprite.png        ← 地图/库存 2D 精灵（可选）
```

## config.json 关键字段

| 字段 | 说明 |
|------|------|
| `id` | 货物唯一标识，与目录名一致 |
| `label` | 中文名称，如"稻米" |
| `labelEn` | 英文名称 |
| `category` | `crop` / `iron_tool` / `weapon` / `raw_material` / `processed` / `luxury` / `medicine` / `cultural_item` |
| `price` | 基础市场售价（文/单位） |
| `unit` | 计量单位（石、件、担、柄……） |
| `storageSlots` | 每堆占用的仓库格子数 |
| `stackSize` | 每个仓库格子最多堆放数量 |
| `function` | 货物主要功能：`food` / `tool` / `weapon` / `material` / `culture` / `medicine` / `luxury` / `transport` |
| `effects` | 消费/存在时的效果列表（满足需求、产出加成、属性加成） |
| `cropData` | 仅农作物有：肥力系数、生长季节、需水量、最优地形 |
| `toolData` | 仅铁器有：效率加成、耐久度上限、每日磨损、补购阈值 |
| `producedBy` | 生产来源（建筑 ID 或 `"farmzone"`） |
| `storedIn` | 可存储的建筑 ID 列表 |
| `consumedBy` | 消费方（建筑 ID 或 `"citizen"`） |
| `perishable` | 是否易腐，蔬菜等需快速流通 |

## 货物分类总览

| ID | 名称 | 类别 |
|----|------|------|
| `rice` | 稻米 | crop |
| `millet` | 粟米 | crop |
| `wheat` | 麦子 | crop |
| `soybean` | 黄豆 | crop |
| `vegetable` | 蔬菜 | crop（易腐） |
| `iron_ore` | 铁矿石 | raw_material |
| `tool_quyuanli` | 曲辕犁 | iron_tool |
| `tool_tiechu` | 铁锄 | iron_tool |
| `tool_tielian` | 铁镰 | iron_tool |
| `tool_tiepa` | 铁耙 | iron_tool |
| `tool_tiechan` | 铁铲 | iron_tool |
| `weapon_sword` | 铁剑 | weapon |
| `weapon_spear` | 长矛 | weapon |
| `horseshoe` | 马蹄铁 | processed |

## 新增货物

1. 在 `goods/` 下创建 `{goodId}/config.json`
2. `id` 与目录名一致
3. `_loader.ts` 自动检测，**无需手动注册**

