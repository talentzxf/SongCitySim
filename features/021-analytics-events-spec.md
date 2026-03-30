# 021 — 产品分析与埋点事件规范

概述：定义产品关键埋点事件与属性，确保上线后能回答用户行为、货币化与留存相关问题。

关键功能点：
- 事件分类：用户行为（会话/建造/购买/参观）、系统事件（崩溃/性能警告）、经济事件（税收/交易）
- 关键事件示例：session_start/session_end, build_structure, upgrade_structure, purchase_item, tutorial_complete, disaster_occurred, trade_executed
- 属性建议：user_id（匿名 ID）、city_level、timestamp、device_type、country、event_value（货币/资源数）
- 采样与隐私：大流量事件采样策略、PII 屏蔽规则、GDPR/CCPA 合规说明
- 报表需求：DAU/MAU、次留/七日留存、付费渗透率、ARPU/LTV、事件漏斗（新手转付费）

优先级：P0（必备）、P1（深度埋点）

验收标准：
- 集成指南与首批 30 个埋点定义文档完成
- 能在分析平台查看基本报表（留存、付费）

实现要点（PM 视角）：
- 与数据工程协商事件发版流程与 schema 变更策略
- 形成标准事件命名约束与检验工具

备注：早期埋点决定后期可分析能力，务必在 MVP 前落地。