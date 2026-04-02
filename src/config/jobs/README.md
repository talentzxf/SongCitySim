# src/config/jobs

每种职业独占一个子目录，目录名即为职业 ID（与代码中的 `Profession` 类型保持一致）。

## 目录结构

```
jobs/
  _schema.ts          ← TypeScript 类型定义（JobConfig）
  _loader.ts          ← Vite glob 动态加载器，导出 JOB_REGISTRY
  {jobId}/
    config.json       ← 职业元数据（必须）
    icon.svg          ← UI 图标（可选）
    portrait.png      ← 市民面板职业头像（可选）
```

## config.json 关键字段

| 字段 | 说明 |
|------|------|
| `id` | 职业唯一标识，与目录名一致 |
| `label` | 中文名称，如"铁匠" |
| `labelEn` | 英文名称 |
| `buildingIds` | 工作建筑列表（引用 `buildings/{id}`），空数组表示无固定建筑（如农夫） |
| `prerequisites.minCultureScore` | 城市最低文化分（0–100），部分高级职业需要文化底蕴 |
| `prerequisites.minLiteracyRate` | 城市最低识字率（0–1），如"学子"需要一定文化基础 |
| `prerequisites.minAge` / `maxAge` | 市民年龄限制 |
| `prerequisites.techNodes` | 必须研究的科技节点 ID |
| `attributes.dailyIncome` | 每游戏日收入（文） |
| `attributes.satisfactionBonus` | 就业满意度加成（0–100 刻度） |
| `attributes.productivityBase` | 基础生产力倍率（1.0 = 标准） |
| `attributes.skillGrowthRate` | 每工作日的技能成长率（生产力缓慢提升） |

## 职业总览

| ID | 名称 | 工作建筑 | 文化门槛 |
|----|------|----------|----------|
| `farmer` | 农夫 | 农田（farmzone） | 0 |
| `miner` | 矿工 | 冶铁厂 | 0 |
| `storekeeper` | 仓丁 | 粮仓 | 0 |
| `merchant` | 商贩 | 集市、茶坊 | 5 |
| `innkeeper` | 掌柜 | 酒肆 | 8 |
| `smith` | 铁匠 | 铁匠铺 | 10 |
| `herbalist` | 郎中 | 药铺 | 25 |
| `monk` | 僧人 | 寺庙 | 20 |
| `scholar` | 学子 | 书院 | 30 |

## 新增职业

1. 在 `jobs/` 下创建 `{jobId}/config.json`
2. `id` 与目录名一致
3. `_loader.ts` 自动检测，**无需手动注册**
4. 若该职业需要文化/识字门槛，在 `prerequisites` 中设置对应字段

