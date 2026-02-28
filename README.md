# Repo-Guardian

AI 代码库健康体检工具 — 五维度代码质量分析仪表盘。

输入 GitHub 仓库地址或本地项目路径，一键生成包含安全性、代码质量、复杂度、可维护性、规范性的全方位体检报告，并提供 AI 修复建议与一键自动修复能力。

## 功能特性

- **五维雷达图** — 安全性 / 代码质量 / 复杂度 / 可维护性 / 规范性，直观展示代码健康状况
- **多语言支持** — 自动识别 Java、JavaScript/TypeScript 项目，选择对应分析工具链
- **AI 修复建议** — 为每个问题生成极简修复建议和 Diff 代码片段
- **一键自动修复** — 点击即可应用 AI 生成的补丁，修复后自动重新扫描验证
- **项目概览** — 自动发现 API 端点、数据库表结构、项目依赖和框架，附带项目概述文字简介
- **API 关联追踪** — 通过依赖图 BFS 追踪 Controller → Service → Mapper → Table 调用链
- **趋势追踪** — 折线图展示历史扫描五维分数变化趋势
- **问题热力图** — SVG treemap 按目录聚合问题，颜色映射严重程度，支持下钻到文件级
- **扫描历史** — 本地记录最近 20 条扫描，支持快速重扫
- **评分标准说明** — AI 体检总结中详细说明五维评分的扣分规则

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS 4 + Recharts |
| 后端 | Node.js + Express + TypeScript |
| 安全扫描 | Semgrep CLI |
| JS/TS 分析 | ESLint CLI (JSON 输出解析) |
| Java 分析 | 内置 Checkstyle + PMD 规则引擎（零外部依赖） |
| 复杂度 | 内置圈复杂度计算 |

## 快速开始

### 环境要求

- Node.js 20+
- npm 9+
- Semgrep CLI（可选，安全扫描需要）
- ESLint（可选，JS/TS 项目分析需要）

### 安装与启动

```bash
# 克隆项目
git clone https://github.com/jayoz96/repo-guardian.git
cd repo-guardian

# 安装依赖
npm install

# 启动后端（端口 3001）
npm run dev:backend

# 新开终端，启动前端（端口 5173）
npm run dev:frontend
```

浏览器打开 http://localhost:5173 即可使用。

## 使用方式

1. 在输入框中填入 GitHub 仓库 URL 或本地项目绝对路径
2. 点击「开始扫描」
3. 等待分析完成，查看五维雷达图和评分卡片
4. 展开问题列表，查看修复建议和 Diff 对比
5. 点击「一键修复」自动应用补丁，系统会自动重新扫描验证效果

## 项目结构

```
repo-guardian/
├── frontend/           # React 前端
│   └── src/
│       ├── components/
│       │   ├── charts/        # 雷达图
│       │   └── dashboard/     # 仪表盘组件
│       └── types/
├── backend/            # Express 后端
│   └── src/
│       ├── routes/            # API 路由
│       ├── services/          # 分析引擎
│       └── types/
└── package.json        # Workspace 根配置
```

## License

MIT
