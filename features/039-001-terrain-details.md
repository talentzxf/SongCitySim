# 001.x — 地形系统细化（Terrain System 细分）

目标：把地形系统拆成可交付的子功能模块与参数表，便于产品/设计/美术/平衡团队明确需求与验收。

1.1 地块属性表（必须）
- id: 唯一标识
- type: {plain, hill, mountain, water, wetland, marsh, fertile, rocky, coastal}
- elevation: 数值（0-100）表示海拔/高程等级
- fertility: 农业肥力（0-100）影响作物产出
- water_proximity: 离河/湖/海的距离（米/格）影响渔业/旅游/洪水风险
- buildable: 布尔/约束（allowed/restricted/conditional）
- soil_stability: 地基稳定性（影响大型建筑/桥梁建设成功率）
- resource_tags: 列表（salt, clay, iron, timber, spring）
- aesthetic_value: 美观度（tourism boost）

1.2 地形生成参数（必须）
- map_seed 参数集合（seed, river_density, mountain_density, coastal_percent）
- biome 模式：内陆平原、河网密集、山城、沿海港口
- 碎片化/连续性参数：控制可建平地块的连片大小分布
- 分布约束：资源点、历史遗迹、村落起点的最小/最大间距

1.3 地形改造项目（必须）
- 平整土方（flatten）: cost_per_unit_volume, time_per_unit, ecological_impact
- 填海（reclaim）: cost, required_tech, maintenance, long_term_sea_risk
- 建堤/堤坝（levee）: protection_radius, durability, maintenance_cost, impacts_on_ecosystem
- 挖渠/改道（channeling）: effects_on_water_flow, downstream_risk
- 排水/抽水站（pumping）: capacity, energy_consumption, seasonal_effectiveness
- 山坡支护（retaining_walls）: allow_building_on_slopes, cost

1.4 可视化图层与玩家工具（必须）
- 高程热力图（色带）
- 洪水风险图（历史/概率模型）
- 肥力/资源图层
- 建造可行性/额外成本图（显示当前鼠标下地块的改造与建造成本）
- 预览模式：在实施改造前，展示改造后地形、成本与主要系统影响（洪水/生态/旅游）

1.5 经济与风险模型（必须）
- 改造 ROI 计算示例：ROI = (新增税收 + 新产出价值 + 旅游收入 - 维护成本) / upfront_cost
- 洪水模型：基于降雨/台风/上游地形溢出概率计算淹水范围与损失预估
- 生态代价：改造会降低某些区域的生态值并触发长期惩罚（如渔业产出降低）

1.6 关卡/场景模板（建议）
- 新手友好地图：低起伏，大平原，稀少洪水
- 水患治理剧本：多河网，频繁洪水，需要堤防与疏浚工程
- 山城发展：高坡/断崖，桥梁与隧道为关键工程

验收条件：
- 提供完整地块属性表 CSV 与示例地图生成配置
- UI 能切换并显示至少 4 种图层并提供改造预览

备注（PM 指示）：
- 产品应把地形作为长期策略元素，避免通过一次性改造即可完全消解地形挑战
- 地形改造应有维护成本与政策/社会代价，鼓励权衡而非强制最优解