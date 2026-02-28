# Repo-Guardian 开发标准

## 项目概述
Repo-Guardian 是一个 AI 代码库健康体检工具，提供五维度代码质量分析仪表盘。

## 技术栈

### 前端
- **构建工具**: Vite
- **框架**: React 18 + TypeScript
- **样式**: Tailwind CSS 4
- **组件库**: Shadcn UI
- **图标**: lucide-react
- **图表**: recharts
- **主题**: 深色模式 (Dark Mode) 优先

### 后端
- **运行时**: Node.js 20+
- **框架**: Express + TypeScript
- **分析引擎**: semgrep CLI, eslint CLI (JSON 输出解析)
- **Java 分析引擎**: 内置 Checkstyle + PMD 规则引擎（TypeScript 实现，零外部依赖）
- **文件访问**: MCP Filesystem 协议

## 项目结构
```
repo-guardian/
├── CLAUDE.md
├── frontend/          # Vite + React 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/           # Shadcn UI 组件
│   │   │   ├── dashboard/    # 仪表盘组件
│   │   │   │   ├── Dashboard.tsx      # 主仪表盘容器
│   │   │   │   ├── ScanInput.tsx      # 扫描输入框
│   │   │   │   ├── ScanHistory.tsx    # 扫描历史下拉
│   │   │   │   ├── IssueList.tsx      # 问题列表
│   │   │   │   ├── DiffViewer.tsx     # Diff 对比弹窗
│   │   │   │   ├── AiSummary.tsx      # AI 体检总结
│   │   │   │   ├── Skeleton.tsx       # 骨架屏组件族
│   │   │   │   ├── ScoreCard.tsx      # 评分卡片
│   │   │   │   ├── IssueHeatmap.tsx  # 问题热力图（SVG treemap）
│   │   │   │   └── Header.tsx         # 顶部导航
│   │   │   └── charts/       # 图表组件
│   │   │       ├── RadarChart.tsx    # 五维雷达图
│   │   │       └── TrendChart.tsx    # 趋势折线图
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── types/
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
├── backend/           # Express 后端
│   ├── src/
│   │   ├── routes/
│   │   │   └── analysis.ts            # /api/v1/analyze 路由
│   │   ├── services/
│   │   │   ├── semgrep-analyzer.ts    # 安全扫描
│   │   │   ├── eslint-analyzer.ts     # JS/TS 质量+规范检查
│   │   │   ├── checkstyle-analyzer.ts # Java 规范检查（内置引擎）
│   │   │   ├── pmd-analyzer.ts        # Java 质量检查（内置引擎）
│   │   │   ├── complexity-analyzer.ts # 圈复杂度分析
│   │   │   ├── maintainability-analyzer.ts # 可维护性分析
│   │   │   ├── ai-agent.ts            # AI 修复建议生成
│   │   │   ├── auto-fixer.ts          # 自动修复引擎
│   │   │   ├── git-service.ts         # GitHub 克隆服务
│   │   │   └── demo-data.ts           # 演示数据回退
│   │   ├── types/
│   │   └── index.ts
│   └── package.json
└── package.json       # workspace root
```

## 编码规范
- 使用 TypeScript strict 模式
- 组件使用函数式 + hooks
- API 路由前缀: `/api/v1/`
- 所有分析结果统一为 `AnalysisResult` 类型
- 文件命名: kebab-case
- 组件命名: PascalCase

## 五维分析维度

### 语言自动检测
系统通过递归扫描项目目录中的文件扩展名（`.java` vs `.js/.ts/.jsx/.tsx`），自动判断项目主要语言，选择对应的分析工具链。

### JS/TS 项目
1. **安全性 (Security)** - semgrep 安全规则扫描
2. **代码质量 (Quality)** - ESLint 规则检查
3. **复杂度 (Complexity)** - 圈复杂度分析
4. **可维护性 (Maintainability)** - 代码重复 / 文件大小
5. **规范性 (Standards)** - ESLint 编码风格检查

### Java 项目
1. **安全性 (Security)** - semgrep Java 规则扫描
2. **代码质量 (Quality)** - 内置 PMD 引擎（UnusedImport / EmptyCatch / SystemPrintln / HardcodedPassword / MagicNumber / LongMethod）
3. **复杂度 (Complexity)** - 圈复杂度分析
4. **可维护性 (Maintainability)** - 代码重复 / 文件大小
5. **规范性 (Standards)** - 内置 Checkstyle 引擎（LineLength / TabChar / NamingConvention / StarImport / MissingJavadoc / BraceStyle）

## 交互式代码审计工作流

### 设计理念
Repo-Guardian 的核心交互围绕"一键体检"展开：用户输入 GitHub 链接或本地路径，系统自动完成从代码拉取到 AI 深度审计的全流程，最终以可视化仪表盘呈现五维健康报告。

### 工作流阶段

```
用户输入 → 代码拉取 → 多引擎并行分析 → AI 智能增强 → 可视化呈现
```

**阶段 1：输入与触发**
- 支持 GitHub 仓库 URL 和本地绝对路径两种输入
- 输入框预填示例地址，降低使用门槛
- 扫描历史下拉菜单（localStorage 持久化，最近 20 条记录）

**阶段 2：动态反馈**
- 骨架屏（Skeleton）替代传统 Loading 转圈，保持页面结构感
- 状态文字动态轮播：`正在拉取远程代码...` → `正在进行 AI 深度审计...`
- 雷达图区域显示同心圆脉冲骨架，评分卡片显示条形脉冲骨架

**阶段 3：多引擎并行分析**
- 四大分析引擎通过 `Promise.all` 并行执行：
  - Semgrep → 安全漏洞扫描
  - ESLint → 代码质量 + 规范性检查
  - Complexity Analyzer → 圈复杂度计算
  - Maintainability Analyzer → 文件长度 / 代码块分析
- GitHub 仓库通过 `git clone --depth 1` 浅克隆到临时目录
- 分析完成后自动清理临时文件

**阶段 4：AI 智能增强**
- 为每个漏洞生成 ≤10 字的极简修复建议（如"参数化查询防注入"）
- 为每个问题生成 unified diff 格式的修复代码片段
- 产出整体健康总结：等级评定（A/B/C/D）、各维度得分、最薄弱环节提示
- 当分析工具不可用时，智能回退到演示数据（Demo Fallback）

**阶段 5：可视化呈现**
- 五维雷达图（Recharts）直观展示各维度得分
- 评分卡片带进度条和颜色编码（绿/黄/红）
- 问题列表按严重程度排序，支持展开查看详情
- Diff 对比弹窗：左侧原始代码 / 右侧 AI 修复建议，语法高亮 + 红绿差异背景

### 关键组件架构

| 组件 | 职责 |
|------|------|
| `ScanInput` | 输入框 + 动态状态文字 |
| `ScanHistory` | 扫描历史下拉菜单 |
| `RadarChart` | 五维雷达图 |
| `ScoreCard` | 单维度评分卡片 |
| `IssueList` | 问题列表（按严重程度排序） |
| `DiffViewer` | 左右对比 Diff 弹窗 |
| `AiSummary` | AI 体检总结面板 |
| `Skeleton` | 骨架屏组件族（雷达/卡片/列表/总结） |
| `TrendChart` | 趋势折线图（6 条线：5 维度 + 均分） |
| `IssueHeatmap` | 目录级问题热力图（SVG treemap + 下钻） |

### 容错与降级策略
- GitHub 克隆失败 → 返回 Spoon-Knife 演示数据
- 分析工具未安装（全部 100 分 + info 级别）→ 回退演示数据
- 网络请求失败 → 前端显示错误提示条
- 内网 Git 认证失败 → 提示用户附带 Access Token
- 克隆超时 → 提示检查内网连接

### 自动发现 → 自动修复 → 闭环验证（核心技术亮点）

这是 Repo-Guardian 区别于传统静态分析工具的核心能力：不仅能发现问题，还能自动修复并验证修复效果。

```
扫描发现问题 → 用户点击"一键修复" → AI 应用 Diff 补丁 → Toast 通知"修复已应用"
                                                          ↓
                                              自动重新扫描（1.5s 延迟）
                                                          ↓
                                              验证分数是否上升 ← 闭环完成
```

**技术实现要点：**

1. **后端修复引擎** (`auto-fixer.ts`)
   - 解析 unified diff 提取删除行（`-`）和新增行（`+`）
   - 在目标行 ±5 行范围内模糊匹配，容忍行号偏移
   - 支持三种操作：精确替换、纯新增、行级覆盖
   - 修复后写回源文件，失败时返回具体错误信息

2. **前端交互流程**
   - 每个问题项展开后显示"一键修复"按钮（绿色扳手图标）
   - 点击后按钮进入 loading 态（图标旋转 + "修复中..."）
   - 修复成功：右上角滑入绿色 Toast → 1.5s 后自动触发重新扫描
   - 修复失败：右上角滑入红色 Toast，显示具体错误原因

3. **闭环验证机制**
   - 修复成功后自动调用 `handleScan(projectPath)` 重新分析
   - 用户可直观对比修复前后的雷达图和各维度分数变化
   - 扫描历史自动记录每次扫描的均分，形成分数趋势

| 新增组件/服务 | 职责 |
|--------------|------|
| `auto-fixer.ts` | 后端：解析 diff + 应用代码修复 |
| `POST /api/v1/fix` | 后端：修复 API 端点 |
| `Toast.tsx` | 前端：修复结果通知（滑入动画） |
| `IssueList.onFix` | 前端：一键修复回调 + 按钮状态 |
