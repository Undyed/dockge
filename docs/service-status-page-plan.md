# Dockge 服务状态监控页面设计与实现规划

本项目旨在为 Dockge 增加实时的容器资源监控页面，帮助用户直观了解各个服务（Services）和项目（Stacks）的 CPU、内存、网络及磁盘占用情况。

## 1. 完整要求 (Requirements)

### 1.1 核心指标采集
- **CPU 利用率**：实时百分比展示。
- **内存占用**：显示当前使用量及配额限制（如 512MB / 2GB），并计算百分比。
- **网络 I/O**：实时上行（TX）/ 下行（RX）速率。
- **磁盘 I/O**：实时的读取/写入速率。
- **状态感知**：容器运行时间（Uptime）及健康检查（Health Check）状态。

### 1.2 UI/UX 设计
- **多模式支持**：原生支持浅色（Light）与暗色（Dark）模式，UI 风格与 Dockge 保持高度一致。
- **玻璃拟态风格**：采用半透明卡片设计，提升视觉高级感。
- **拓扑展示**：指标按 Stack 分组展示，支持展开/收起单个 Stack。
- **实时波形**：每个核心指标（如 CPU/内存）配备微型趋势图（Sparklines），展示过去 60 秒的波动情况。
- **响应式布局**：完美适配桌面端大屏及移动端竖屏操作。

### 1.3 性能与架构
- **多机支持**：主节点需能聚合展示远程 Agent 的资源统计数据。
- **按需采集**：仅当用户打开监控页面时，后端才启动 `stats` 采集任务，避免无效资源消耗。
- **可自定义频率**：支持用户选择刷新频率（1s, 5s, 15s）。

---

## 2. 可行性分析 (Feasibility Analysis)

### 2.1 数据来源 (Backend)
- **方案**：采用 `docker compose stats --no-stream --format json`。
- **分析**：Dockge 现有的 `Stack` 类已具备执行 Compose 命令的能力。该方案能一次性获取一个 Stack 下所有容器的统计信息，相比逐个查询 API，性能损耗更低且易于解析。

### 2.2 通信机制 (Communication)
- **方案**：扩展现有的 `Socket.io` 通信协议。
- **分析**：参照现有日志流（Terminal）的实现方式，使用“订阅/发布”模式。前端订阅 `stats` 事件，后端定时推送，架构完全契合。

### 2.3 前端实现 (Frontend)
- **方案**：Vue 3 组合式 API + Bootstrap 5 组件 + SCSS 变量。
- **分析**：Dockge 前端已有完善的颜色变量系统（`vars.scss`），实现双色模式切换只需引用现有 CSS 变量。监控图表可由 SVG 或轻量级 Canvas 库（如 `chart.js`）实现。

---

## 3. 实现规划 (Implementation Roadmap)

### 第一阶段：后端基础开发 (Internal Foundation)
1. **指标采集逻辑**：在 `backend/stack.ts` 中新增 `getStats()` 方法，解析 `docker compose stats` 的 JSON 输出。
2. **多 Agent 转发**：在 `agent-socket-handlers` 中定义监控数据上报接口。

### 第二阶段：Socket 通信层 (Sync Layer)
1. **建立订阅机制**：实现 `subscribe-stats` 和 `unsubscribe-stats` 处理逻辑。
2. **定时器管理**：实现基于活跃连接数的采集任务调度器，确保无人观看时自动停止采集。

### 第三阶段：前端核心页面 (UI Components)
1. **状态页面组件**：创建 `frontend/src/pages/Status.vue`。
2. **指标进度条组件**：开发支持双色模式和发光效果的监控进度条组件。
3. **路由配置**：在 `router.ts` 中注册路径，并在 `Layout.vue` 中添加导航入口。

### 第四阶段：Stack 详情集成 (Integration)
1. **详情页扩展**：在现有 Compose 编辑/查看页面中增加“监控”标签页，支持查看单个项目的详细资源占用。

### 第五阶段：优化与抛光 (Optimization)
1. **多语言适配**：在 `zh-CN.json` 和 `en.json` 中添加相关词条。
2. **节流优化**：实现浏览器标签后台化时自动降低采集频率的策略。

---

## 4. 结论
该功能在现有 Dockge 架构下具有极高的可行性，通过复用现有的容器管理逻辑和 Socket 通信框架，可以以较低的改动成本实现类似专业监控工具（如 Portainer/Netdata）的资源概览体验。
