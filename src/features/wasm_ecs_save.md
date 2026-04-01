# wasm_ecs_save

短标题：wasm_ecs_save

状态：提案 / 后续功能（非紧急）

描述
---
把 simulation 的运行时权威状态迁移到 Rust/Wasm 中，以 Worker（Web Worker）为宿主，采用 ECS 风格的数据布局（实体 + 组件）并通过二进制格式对外持久化（默认 MessagePack）。主线程（JS/React）成为无状态的渲染与输入层，Worker 内部负责 tick、路径查找、AI/行为与 RNG，保存/加载由 Rust 直接在内存上高效序列化。

目标
---
- 提供高性能、可扩展的运行时（尤其是大量实体时）
- 提供确定性可重现的快照（保存 RNG/PRNG 状态）
- 用紧凑二进制格式保存（默认 MessagePack），并将 save 存入浏览器 IndexedDB，同时支持导出/导入文件
- 为未来分阶段迁移奠定基础（先序列化/反序列化、再迁移部分系统，最后完全迁移）

主要特性要点
---
- Worker(Rust) 为 simulation 的权威（可选，默认关闭）
- 内部使用 ECS（列式组件）管理动态实体（walkers, citizens, peddlers, oxcarts, marketBuyers）
- 渲染更新采用列式 TypedArray（Float32Array/Uint32Array）传输位置/状态，配合小型二进制元消息表示增量或实体元数据
- 保存格式：envelope (id, name, created_at, version, format, metadata, rng_state) + blob (MessagePack 或 CBOR 序列化的组件集合)
- 自动保存：默认每 60s（可配置），仅在 state 变更时写入

兼容与迁移策略（分阶段）
---
1. 序列化阶段（低风险）
   - 实现 Rust/Wasm 的 serialize/deserialize API（MessagePack），JS 保持权威，立即提供高效 save/load
2. 混合阶段（中等）
   - 将移动实体子系统或最昂贵的系统迁移到 Worker，主线程通过 TypedArray 获取渲染列数据
3. 完全迁移（长期）
   - Worker 成为完全权威的 simulation core，JS 仅渲染/输入

接口与协议（概要）
---
- Worker ↔ 主线程
  - init(config)
  - input(event)
  - subscribe_positions() -> 回传 TypedArray 缓冲区（或周期性更新）
  - snapshot_request() -> 返回 MessagePack blob
  - migrate_load(blob) -> 将 save 加载进 Worker
- Wasm 导出（若需要 JS 调用）
  - serialize_state(js_state) -> Uint8Array
  - deserialize_state(bytes) -> JsValue

存储细节
---
- 存储后端：IndexedDB（BLOB + metadata），并支持“导出为文件 (.citysave)”
- 每个 save 带 schema_version，Rust 端维护 migration 函数链
- RNG：使用确定性 PRNG（例如 ChaCha family），并保存内部状态以保证可重现性

配置与开关
---
- feature key: `wasm_ecs_save`
- 建议把 feature toggle 放在 `src/config/features.ts`（或现有配置中心），默认 `enabled: false`

验收标准（最小）
---
- 能在 dev 环境下通过配置开启 wasm_ecs_save 功能
- Worker 能返回用于渲染的 Position 列（TypedArray），主线程能正确渲染这些数据
- 能在浏览器中保存并载入一个 save（IndexedDB + 导出/import），并在载入后恢复可见的实体/建筑/时间状态

备注
---
- 该功能工作量较大，建议按分阶段迁移执行，初期优先做序列化/反序列化并在 HUD 提供开关与导出功能；完全迁移到 Worker/ECS 应作为后续里程碑。


将来待办（示例）
---
- [ ] 新建 Rust/Wasm 项目模板（wasm/save_wasm），实现 serialize/deserialize
- [ ] 前端实现 save API（IndexedDB）、HUD 导出/导入 UI
- [ ] 设计 TypedArray 布局与 delta 协议
- [ ] 迁移 walker subsystem 至 Worker 并验证渲染

作者：提案生成器
时间：2026-04-01
