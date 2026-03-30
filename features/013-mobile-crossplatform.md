# 013 — 跨平台与移动发布策略（从网页版到 Android）

概述：规划从 Web (HTML5) 起步，后期无缝扩展到 Android/iOS 的技术路径和权衡。

推荐技术路线及权衡：

1) Web-first (React + TypeScript) + Canvas/WebGL (PixiJS/Three.js/Phaser)
   - 优点：快速迭代、部署方便、低上手门槛；直接运行在浏览器
   - 移动化路径：使用 TWA（Trusted Web Activity）或 Capacitor/Capacitor + Cordova 打包成 Android 应用；或 Progressive Web App (PWA)
   - 缺点：受 WebView 性能限制，复杂动画或大量实体时可能性能不足

2) 游戏引擎方案（Unity / Cocos Creator / Godot）
   - Unity (C#)
     - 优点：成熟跨平台（WebGL + Android/iOS/PC）、强大的可视化工具、生态丰富
     - 缺点：打包体积较大、WebGL 模式需要优化
   - Cocos Creator (TypeScript)
     - 优点：对 2D 策略/模拟友好，支持 Web 与原生发布，代码可复用
     - 缺点：生态/工具相比 Unity 略少
   - Godot (GDScript/C#)
     - 优点：轻量开源、灵活，支持导出到多个平台
     - 缺点：移动与 Web 的一些平台差异需适配

3) Hybrid（游戏内核用纯 JS/TS，再用 React Native / Flutter 做原生 UI）
   - 优点：UI 使用原生控件体验好，游戏逻辑复用有限
   - 缺点：整合成本高，复杂渲染在原生侧实现更难

发布建议（路线图）：
- 阶段 0 (MVP)：Web-first，使用 React + PixiJS/Phaser，最小可玩版本
- 阶段 1：通过 PWA + TWA 打包成 Android 试运行；评估性能瓶颈
- 阶段 2：如果核心性能或交互需求超出 Web 能力，考虑用 Unity 重写渲染/核心循环并复用数据/设计资产
- 阶段 3：完善移动特性（触摸优化、低能耗模式、本地存档/云存档、应用内支付）

工程注意点：
- 资源管理：采用压缩纹理/切图、按需加载与 LOD
- 输入抽象：设计一层输入适配器（鼠标/触摸/虚拟摇杆）
- 存档与同步：支持本地存档 + 云同步（后端或第三方服务）
- 分析与崩溃收集：集成移动端 SDK（Firebase/UMeng/Adjust）

优先级：P0（规划）、P1（实现打包路径）

验收标准：
- Web 版本可作为 PWA 打包并在 Android 上运行
- 性能测试覆盖目标 Android 机型并满足帧率/内存目标或给出迁移计划

依赖：001、014、016