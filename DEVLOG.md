# Repo-Guardian 开发日志

> AI 代码库健康体检工具 — 五维度代码质量分析仪表盘

---

## Phase 0: 项目初始化

- [x] 创建 monorepo 工作区（frontend + backend）
- [x] 前端：Vite + React 19 + TypeScript + Tailwind CSS 4
- [x] 后端：Express + TypeScript + tsx 热重载
- [x] 定义 `AnalysisResult` 统一类型（前后端同步）

---

## Phase 1: 核心分析引擎

- [x] `semgrep-analyzer.ts` — 安全漏洞扫描（Semgrep CLI）
- [x] `eslint-analyzer.ts` — JS/TS 代码质量 + 规范性检查
- [x] `complexity-analyzer.ts` — 圈复杂度分析
- [x] `maintainability-analyzer.ts` — 文件长度 / 代码块分析
- [x] `checkstyle-analyzer.ts` — Java 规范检查（内置引擎）
- [x] `pmd-analyzer.ts` — Java 质量检查（内置引擎）
- [x] 语言自动检测（Java vs JS/TS）选择对应工具链

---

## Phase 2: 前端仪表盘

- [x] `Dashboard.tsx` — 主容器，状态管理
- [x] `ScanInput.tsx` — 输入框 + 动态状态文字轮播
- [x] `RadarChart.tsx` — 五维雷达图（Recharts）
- [x] `ScoreCard.tsx` — 评分卡片（进度条 + 颜色编码）
- [x] `IssueList.tsx` — 问题列表（按严重程度排序）
- [x] `AiSummary.tsx` — AI 体检总结面板
- [x] `Skeleton.tsx` — 骨架屏组件族（雷达/卡片/列表/总结）
- [x] `Header.tsx` — 顶部导航
- [x] `ScanHistory.tsx` — 扫描历史下拉（localStorage 持久化）

---

## Phase 3: AI 智能增强

- [x] `ai-agent.ts` — AI 修复建议生成引擎
- [x] 极简修复建议（≤10 字关键词匹配）
- [x] Unified Diff 格式修复代码片段生成
- [x] 语言感知 Diff（Java / JS 分别生成对应代码）
- [x] 整体健康总结（A/B/C/D 等级评定）
- [x] `demo-data.ts` — 演示数据回退（工具不可用时降级）

---

## Phase 4: Diff 对比弹窗

- [x] `DiffViewer.tsx` — 左右对比 Diff 弹窗
- [x] Unified Diff 解析器（parseDiff / splitSides）
- [x] Token-based 语法高亮（避免正则冲突）
- [x] CSS 类名高亮（`.diff-keyword` / `.diff-string` / `.diff-comment`）
- [x] ~~弹窗尺寸 max-w-4xl~~ → 升级为 `w-[96vw] max-w-[90vw] h-[85vh]`
- [x] 标题栏显示文件路径 + 问题描述上下文

---

## Phase 5: 自动修复闭环

- [x] `auto-fixer.ts` — 后端修复引擎（解析 Diff + 模糊匹配 + 写回文件）
- [x] `POST /api/v1/fix` — 修复 API 端点
- [x] `Toast.tsx` — 修复结果通知（滑入动画）
- [x] 一键修复按钮（loading 态 + 图标旋转）
- [x] 修复成功后自动重新扫描（1.5s 延迟闭环验证）

---

## Phase 6: 项目概览

- [x] `project-overview.ts` — 项目深度扫描引擎
- [x] API 端点自动发现（Spring / Express / Flask / NestJS）
- [x] 数据库表结构扫描（JPA / MyBatis / TypeORM / Prisma / SQL）
- [x] 依赖解析（package.json / pom.xml / build.gradle）
- [x] 框架识别（Spring Boot / React / Vue / MyBatis 等）
- [x] `ProjectOverview.tsx` — 前端概览面板（API 列表 / 表结构弹窗 / 搜索）

---

## Phase 7: 依赖图 & 关联追踪

- [x] `buildClassToTableMap()` — 实体类 → 表名映射
- [x] `buildClassInjectionsMap()` — 类 → 注入依赖（逐行扫描）
- [x] `buildMapperToTablesMap()` — Mapper/Repo → 表名
- [x] `buildInterfaceImplMap()` — 接口 → 实现类映射（支持泛型）
- [x] `resolveTablesForClass()` — BFS 遍历 Controller → Service → Mapper → Table
- [x] 命名约定兜底（`XxxService` → `XxxServiceImpl`）
- [x] MyBatis-Plus `ServiceImpl<Mapper, Entity>` 模式提取
- [x] API 端点展示关联表标签 + 搜索支持表名过滤

---

## Phase 8: 问题去重优化

- [x] `deduplicateIssues()` — 按 ruleId + file 聚合去重
- [x] 合并同类问题（保留最高严重级别 + 列出所有行号）
- [x] 为 complexity / maintainability 添加 `[RuleId]` 前缀
- [x] 跨文件聚合（`HighComplexity` / `MediumComplexity` / `FileTooLong` / `LongCodeBlock`）
- [x] 按严重程度排序（error → warning → info）

---

## Phase 9: UI 打磨

- [x] 深色模式主题（Dark Mode 优先）
- [x] 扫描前雷达图全满（五维 100 分 + 淡蓝色填充）
- [x] 代码字体从 `text-xs` 提升到 `text-sm`
- [x] 表名点击始终弹窗（无数据时 fallback 空结构）
- [x] 数据库表扫描上限提升至 200

---

## Phase 10: 部署上线

- [x] 创建 `.gitignore`
- [x] Git 初始化 + 初始提交（55 files, 9992 insertions）
- [x] 推送至 GitHub：[jayoz96/repo-guardian](https://github.com/jayoz96/repo-guardian)
- [x] 添加 README 文档

---

## 待规划功能

- [ ] 分析报告导出（PDF / HTML）
- [ ] 历史趋势图（折线图展示分数变化）
- [ ] 自定义规则阈值配置
- [ ] 多项目横向对比
- [ ] CI/CD 集成（GitHub Actions）
- [ ] 用户认证 & 多用户支持
