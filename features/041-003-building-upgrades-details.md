# 003.x — 建筑升级与演化细化（Building Upgrades 细分）

目标：把建筑升级流程参数化，给出等级表、前置条件清单、升级 UI 行为与影响模板，便于策划与平衡。

3.1 建筑等级表（必须）
- level: 1..N
- base_cost_upgrade: 金钱与材料清单
- time_to_upgrade: 基础工时
- population_capacity_delta
- tax_yield_delta
- happiness_delta
- maintenance_delta
- appearance_variant_id

3.2 前置条件与约束（必须）
- infra_requirements: min_road_level, power_connected, water_connected
- social_requirements: min_city_level, literacy_rate, law_policy
- spatial_requirements: min_adjacent_plots, blocked_adjacent_types
- tech_requirements: 必须解锁的科技节点或机构（如：印刷术、近代化工坊）

3.3 升级过程与工队管理（必须）
- 升级队列：城市层面整体队列或分区队列（可配置最大并行数）
- 工队派遣：工队响应时间、效率（受道路拥堵/天气影响）
- 进度反馈：UI 显示剩余时间、消耗与施工暂停/取消选项
- 快速完成选项：用货币/道具跳过剩余时间（考虑平衡）

3.4 文化/遗产与不可逆选择（必须）
- 遗产标签（protected/transformable）与升级约束
- 改造选项：保守改造（保留外观，提升内部功能）或彻底改造（改变外观，解锁现代化效果）
- 社会反应：拆迁会降低部分居民幸福或触发抗议事件

3.5 平衡与 ROI 指引（必须）
- 升级 ROI 计算模板（见地形文档）
- 成本时间曲线：早期便宜升级 vs 后期高成本大幅提升
- 奖励曲线：升级应带来可感知但非垄断式的产出提升

3.6 示例建筑升级路径（建议）
- 四合院（level1 居民 -> level2 小酒店/民宿 -> level3 文化遗产旅馆）
- 作坊（level1 小作坊 -> level2 工坊连片 -> level3 匠人工坊）

验收条件：
- 提供 10 类代表性建筑的等级表与前置条件清单
- 升级 UI 原型展示等级变化、成本与施工队列功能

备注（PM 指示）：
- 升级系统要支持玩家表达城市发展方向（商业化、文化保护、工业化）
- 保持升级决策的透明度，避免“隐藏惩罚”导致玩家流失