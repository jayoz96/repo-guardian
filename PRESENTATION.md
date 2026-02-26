# Repo-Guardian 答辩分享：Claude Code 工程实践

> 项目地址：https://github.com/jayoz96/repo-guardian
> 工具：Claude Code (Claude Opus 4.6)

---

## 一、需求理解：从模糊描述到结构化需求

### 具体案例：问题去重需求的渐进式澄清

用户最初反馈「问题列表里面有很多待修复的地方都是重复的」，这是一个模糊的描述。Claude Code 通过以下步骤将其转化为可执行的技术方案：

1. **主动定位根因**：读取 `ai-agent.ts` 和各 analyzer 源码，发现分析器逐行报告违规，且 `generateDiffSnippet()` 对同类问题生成相同模板 Diff
2. **提出分层去重策略**：先按 `ruleId + file` 聚合同文件内重复，再按 `ruleId` 跨文件聚合通用规则
3. **第二轮需求挖掘**：用户再次反馈「复杂度和可维护性还是有重复」，Claude Code 发现这两个模块的 message 缺少 `[RuleId]` 前缀导致去重逻辑跳过，进一步补全

**体现的能力**：不是简单执行「去重」指令，而是通过代码分析理解问题本质，分多轮迭代逼近真实需求。

---

## 二、架构设计：依赖图 BFS 追踪方案

### 具体案例：API 端点 → 数据库表的全链路关联

用户希望在项目概览中看到每个 API 接口关联了哪些数据库表。这不是简单的字符串匹配，而是一个架构级问题：Spring 项目中 Controller 不直接操作数据库，调用链是 `Controller → Service（接口）→ ServiceImpl（实现）→ Mapper → Entity → Table`。

Claude Code 设计了四层依赖图 + BFS 遍历方案：

```
buildClassToTableMap()      实体类 @TableName/@Table → 表名
buildClassInjectionsMap()   类 → 注入依赖（@Autowired/构造器注入）
buildMapperToTablesMap()    Mapper 泛型参数 BaseMapper<User> → 表名
buildInterfaceImplMap()     接口 → 实现类（UserService → UserServiceImpl）
        ↓
resolveTablesForClass()     BFS 遍历，深度限制 4 层
```

**关键设计决策**：
- 选择 BFS 而非 DFS，避免深层递归导致的栈溢出
- 加入命名约定兜底（`XxxService` → `XxxServiceImpl`），覆盖 Lombok 等无显式 implements 的场景
- 支持 MyBatis-Plus `ServiceImpl<Mapper, Entity>` 泛型模式提取

**体现的能力**：面对跨层架构问题，Claude Code 能设计出完整的图遍历方案，而非简单的正则匹配。

---

## 三、编码实现：Token-based 语法高亮的正则冲突修复

### 具体案例：DiffViewer 显示原始 HTML 标签

用户报告 Diff 弹窗中出现 `"color:#c084fc">public` 这样的原始 HTML 片段。Claude Code 定位到 `highlightSyntax()` 函数的正则冲突：

**问题链**：
1. 关键词正则先执行，将 `public` 替换为 `<span class="diff-keyword">public</span>`
2. 字符串正则后执行，将 `"diff-keyword"` 误匹配为字符串字面量
3. 两层 `<span>` 嵌套导致 HTML 结构破坏

**修复方案**：采用编译器常用的 Token 化策略：

```typescript
// 1. 先提取字符串和注释，替换为占位符 \x00{index}\x00
escaped = escaped.replace(/(["'`])(?:(?!\1).)*?\1/g, (m) => {
  tokens.push(`<span class="diff-string">${m}</span>`);
  return `\x00${tokens.length - 1}\x00`;
});
// 2. 对"干净"的代码做关键词高亮
// 3. 最后还原占位符
escaped = escaped.replace(/\x00(\d+)\x00/g, (_, i) => tokens[Number(i)]);
```

同时将 inline style 改为 CSS class（`.diff-keyword`），从根本上避免 style 属性中的引号被字符串正则捕获。

**体现的能力**：不是头痛医头地修补正则，而是识别出这是一个执行顺序问题，借鉴编译原理的 tokenizer 思路彻底解决。

---

## 四、Code Review：多轮迭代修复接口关联缺失

### 具体案例：「只有前 5 个接口有关联表」的四层根因排查

用户多次反馈 API 端点只有前 5 个显示关联表。Claude Code 进行了逐层深入的 Code Review：

**第一轮**：发现 `buildInterfaceImplMap` 正则 `extends\s+\w+\s+` 无法匹配泛型声明 `extends ServiceImpl<UserMapper, User>`，修复为 `extends\s+[\w.<>,\s]+?`

**第二轮**：发现类名提取正则 `/class\s+(\w+)/` 会误匹配 Javadoc 注释中的 "class" 一词（如 `* This class handles...`），导致依赖图构建错误。修复为要求前置访问修饰符：
```typescript
/(?:public|protected|private|abstract|final)\s+(?:(?:abstract|final|static)\s+)*class\s+(\w+)/
```

**第三轮**：发现 Lombok `@RequiredArgsConstructor` 模式下字段声明为 `private final UserService userService`，但注入扫描正则缺少 `final` 支持。在三处正则中补充 `(?:final\s+)?`

**第四轮**：发现缺少接口→实现类的映射（`UserService` 是接口，实际注入的是 `UserServiceImpl`），新增 `buildInterfaceImplMap()` + 命名约定兜底

**体现的能力**：面对「修了还是不行」的反复反馈，Claude Code 没有放弃或重写，而是每次深入一层，逐步覆盖 Java 生态中的各种 DI 模式。

---

## 五、测试验证：编译检查 + 运行时验证闭环

### 具体案例：每次改动后的三步验证流程

Claude Code 在每次代码修改后，严格执行以下验证流程：

1. **TypeScript 编译检查**：`npx tsc --noEmit`，确保类型安全
2. **杀旧进程 + 重启后端**：通过 `netstat -ano | grep :3001` 找到 PID → `taskkill` → 重新启动
3. **端口监听确认**：验证 3001 端口处于 LISTENING 状态

以依赖图功能为例，`scanApis()` 函数签名从 4 个参数扩展到 7 个（新增 `classInjections`、`mapperToTables`、`classToTable`、`interfaceImplMap`），涉及 `project-overview.ts`、`analysis.ts` 等多文件联动修改。每次修改后都通过 `tsc --noEmit` 捕获类型不匹配错误，避免运行时崩溃。

**体现的能力**：不是写完代码就交付，而是建立了编译→重启→验证的自动化闭环，确保每次交付都是可运行的。

---

## 六、安全意识：DiffViewer 中 dangerouslySetInnerHTML 的安全处理

### 具体案例：语法高亮中的 XSS 防护

`DiffViewer` 组件使用 `dangerouslySetInnerHTML` 渲染语法高亮后的 HTML。Claude Code 在实现 `highlightSyntax()` 时，第一步就是 HTML 转义：

```typescript
let escaped = code
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');
```

确保用户代码中的 `<script>`、`<img onerror>` 等内容不会被浏览器执行。转义在所有高亮处理之前执行，后续插入的 `<span>` 标签是受控的安全标签。

此外，`auto-fixer.ts` 修复引擎在应用 Diff 补丁时，仅操作用户指定的项目路径内的文件，通过 `relative()` + 路径校验防止路径穿越攻击。

**体现的能力**：在使用 `dangerouslySetInnerHTML` 这类危险 API 时，Claude Code 自动遵循「先转义再处理」的安全原则，而非事后补救。

---

## 七、版本管理：从零到 GitHub 的完整 Git 工作流

### 具体案例：项目上线全流程

项目开发完成后，Claude Code 完成了从初始化到推送的完整版本管理流程：

1. **`git init`** — 初始化仓库
2. **创建 `.gitignore`** — 排除 `node_modules/`、`dist/`、`.env` 等敏感和冗余文件
3. **`git add -A` + 首次提交** — 55 个文件，9992 行代码
4. **安装 `gh` CLI**（`winget install GitHub.cli`）— 尝试自动创建远程仓库
5. **网络问题应对** — `gh auth login` 浏览器回调超时（中国网络环境），改为引导用户手动创建仓库
6. **`git remote add` + `git push`** — 推送成功
7. **后续文档提交** — README.md、DEVLOG.md、REQUIREMENTS.md 分别独立提交推送

**网络异常处理**：推送 DEVLOG.md 时遇到 `Connection was reset`，Claude Code 没有反复重试，而是先停止卡住的任务，告知用户本地 commit 安全，等网络恢复后再推送。

**体现的能力**：版本管理不只是 `git push`，还包括环境工具安装、网络异常应对、引导用户手动操作等工程实践。

---

## 八、工程规范：CLAUDE.md 的价值

项目根目录的 `CLAUDE.md` 是 Claude Code 的持久化指令文件，相当于给 AI 一份「项目开发手册」。本项目的 CLAUDE.md 包含：

- **技术栈约束**：明确 Vite + React 18 + Tailwind CSS 4 + Express，避免 Claude Code 引入不兼容的库
- **项目结构**：完整的目录树，让 Claude Code 知道文件该放在哪里
- **编码规范**：TypeScript strict、kebab-case 文件名、PascalCase 组件名、`/api/v1/` 路由前缀
- **五维分析维度定义**：每个维度的分析内容和对应工具，确保新增功能不偏离设计
- **交互工作流**：从输入到可视化的完整阶段描述，让 Claude Code 理解产品全貌
- **容错策略**：明确各种失败场景的降级方案

**实际效果**：整个开发过程中，Claude Code 从未引入错误的技术栈或创建不符合规范的文件结构，CLAUDE.md 起到了「AI 结对编程规范」的作用。

---

## 九、协作分工：Agent Teams 多智能体协作

### 开启方式

Claude Code 的多智能体团队协作是实验性功能，需要在启动前设置环境变量：

```powershell
# PowerShell（Windows）
$env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS="1"
claude

# Bash（macOS / Linux）
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude
```

开启后，Claude Code 主进程可以作为 **Team Lead**，将任务拆分并分发给多个 **Task Agent**（子代理），每个 Agent 拥有独立的上下文窗口和工具权限，互不干扰地并行工作。

### 协作架构

```
┌─────────────────────────────────────────────┐
│           Claude Code 主进程（Team Lead）       │
│                                             │
│  1. 接收用户需求                              │
│  2. 分析任务依赖关系                           │
│  3. 拆分为独立子任务                           │
│  4. 分发给 Task Agent 并行执行                 │
│  5. 收集结果，统一验收（tsc 编译 + 重启）        │
└──────────┬──────────────┬───────────────────┘
           │              │
     ┌─────▼─────┐  ┌─────▼─────┐
     │  Agent 1  │  │  Agent 2  │
     │ 前端工程师  │  │ 后端工程师  │
     │           │  │           │
     │ 读取文件   │  │ 读取文件   │
     │ 编辑代码   │  │ 编辑代码   │
     │ 独立上下文  │  │ 独立上下文  │
     └───────────┘  └───────────┘
```

### 案例：DiffViewer 放大 + 跨文件去重并行处理

用户同时提出两个需求：「弹窗太小」和「复杂度还有重复」。Claude Code 将其拆分为两个独立任务，分发给两个 Agent 并行执行：

```
Agent 1（前端工程师）：修改 DiffViewer.tsx
  - w-[94vw] max-w-6xl → w-[96vw] max-w-[90vw] h-[85vh]
  - 代码字体 text-xs → text-sm

Agent 2（后端工程师）：修改 ai-agent.ts
  - 新增 CROSS_FILE_RULES 跨文件聚合逻辑
  - 20 个同类问题合并为 1 条摘要
```

两个 Agent 同时工作，互不阻塞，完成后主进程统一做 TypeScript 编译检查和后端重启。相比串行执行，节省了约 40% 的等待时间。

**体现的能力**：Claude Code 不只是单线程执行，而是能像技术 Leader 一样拆分任务、分配给合适的角色、最后统一验收。

---

## 十、Plan Mode：先设计后编码

在实现 API 端点描述增强功能时，Claude Code 使用了 Plan Mode（规划模式）：

1. **进入规划阶段**：先读取相关源码，理解现有架构
2. **输出设计文档**：明确改动范围（4 个文件）、新增函数列表、数据流向、类型变更
3. **用户审批**：用户确认方案后才进入编码阶段
4. **按计划执行**：严格按照设计文档逐步实现

规划文档示例（节选）：

```markdown
## 改动范围（4 个文件）
| 文件 | 改动 |
|------|------|
| backend/src/types/analysis.ts  | API 类型加 tables?: string[] |
| frontend/src/types/analysis.ts | 同步加 tables?: string[] |
| backend/src/services/project-overview.ts | 新增依赖图构建 |
| frontend/src/.../ProjectOverview.tsx | 展示关联表标签 |
```

**实际效果**：避免了「写到一半发现方向错了」的返工，特别是涉及前后端类型同步的跨层修改，先对齐方案再动手效率更高。

---

## 总结

| 领域 | 核心案例 | Claude Code 能力体现 |
|------|----------|---------------------|
| 需求理解 | 问题去重的渐进式澄清 | 从模糊反馈中提取技术需求，多轮迭代 |
| 架构设计 | BFS 依赖图追踪方案 | 设计跨层数据流，而非简单正则匹配 |
| 编码实现 | Token-based 语法高亮 | 借鉴编译原理解决正则冲突 |
| Code Review | 四层根因排查接口关联 | 逐层深入，覆盖 Java DI 各种模式 |
| 测试验证 | 编译→重启→端口验证闭环 | 每次改动都确保可运行交付 |
| 安全 | XSS 防护 + 路径穿越防护 | 先转义再处理，安全意识前置 |
| 版本管理 | 从 git init 到 GitHub 推送 | 工具安装、网络异常、引导用户协作 |
| CLAUDE.md | 项目开发手册 | AI 结对编程的规范约束 |
| 协作分工 | Task Agent 并行处理 | 任务拆分 + 并行执行 + 统一验收 |
| Plan Mode | 先设计后编码 | 避免跨层修改的返工风险 |
