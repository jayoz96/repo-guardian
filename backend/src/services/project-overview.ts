import { readdir, readFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, extname, basename } from 'node:path';
import type { ProjectOverview, DependencyGraph, DepNode, DepEdge } from '../types/analysis.js';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__',
  'target', '.gradle', '.idea', '.mvn', 'bin', 'out', '.settings',
]);

const CODE_EXTS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.py', '.java',
  '.rb', '.go', '.rs', '.c', '.cpp', '.cs', '.php',
  '.vue', '.svelte', '.kt', '.scala', '.xml', '.json',
  '.yaml', '.yml', '.sql', '.sh', '.bat', '.css',
  '.scss', '.less', '.html', '.md', '.gradle', '.kts',
]);

/** 需要读取内容做深度分析的扩展名 */
const SCAN_EXTS = new Set([
  '.java', '.ts', '.js', '.tsx', '.jsx', '.py', '.go',
  '.kt', '.scala', '.cs', '.rb', '.php', '.sql',
  '.xml', '.yaml', '.yml', '.prisma', '.gradle', '.kts',
]);

interface FileInfo {
  ext: string;
  lines: number;
  path: string;
  content?: string;
}

async function walkFiles(dir: string, depth = 15): Promise<FileInfo[]> {
  if (depth <= 0) return [];
  const results: FileInfo[] = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }

  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...await walkFiles(full, depth - 1));
    } else {
      const ext = extname(e.name).toLowerCase();
      if (CODE_EXTS.has(ext) || ext === '.prisma') {
        let content = '';
        let lines = 0;
        try {
          content = await readFile(full, 'utf-8');
          lines = content.split('\n').length;
        } catch { /* skip */ }
        const needContent = SCAN_EXTS.has(ext) && lines < 3000;
        results.push({ ext, lines, path: full, content: needContent ? content : undefined });
      }
    }
    if (results.length > 2000) break;
  }
  return results;
}

function detectBuildTool(topFiles: string[], allFiles: FileInfo[]): string {
  if (topFiles.includes('pom.xml')) return 'Maven';
  if (topFiles.includes('build.gradle') || topFiles.includes('build.gradle.kts')) return 'Gradle';
  if (topFiles.includes('package.json')) return 'npm/Yarn';
  if (topFiles.includes('Cargo.toml')) return 'Cargo';
  if (topFiles.includes('go.mod')) return 'Go Modules';
  if (topFiles.includes('requirements.txt') || topFiles.includes('pyproject.toml')) return 'pip/Poetry';
  if (topFiles.includes('Gemfile')) return 'Bundler';
  if (topFiles.includes('Makefile')) return 'Make';
  // 子目录中查找构建文件
  for (const f of allFiles) {
    const name = basename(f.path);
    if (name === 'pom.xml') return 'Maven';
    if (name === 'build.gradle' || name === 'build.gradle.kts') return 'Gradle';
  }
  return '未识别';
}

function detectLanguage(breakdown: { ext: string; count: number }[]): string {
  if (breakdown.length === 0) return '未知';
  const top = breakdown[0];
  const langMap: Record<string, string> = {
    '.java': 'Java', '.ts': 'TypeScript', '.tsx': 'TypeScript (React)',
    '.js': 'JavaScript', '.jsx': 'JavaScript (React)', '.py': 'Python',
    '.go': 'Go', '.rs': 'Rust', '.rb': 'Ruby', '.cs': 'C#',
    '.cpp': 'C++', '.c': 'C', '.php': 'PHP', '.kt': 'Kotlin',
    '.scala': 'Scala', '.vue': 'Vue', '.svelte': 'Svelte',
  };
  return langMap[top.ext] ?? top.ext;
}

/** 从匹配位置向上提取最近的注释文本（扩大搜索范围到 15 行） */
function extractComment(content: string, matchIndex: number, maxLines = 15): string {
  const before = content.slice(0, matchIndex);
  const lines = before.split('\n');
  const lineIdx = lines.length - 1;
  const allLines = content.split('\n');

  const commentLines: string[] = [];
  for (let i = lineIdx - 1; i >= Math.max(0, lineIdx - maxLines); i--) {
    const trimmed = allLines[i].trim();
    if (trimmed === '*/' || trimmed === '') continue;
    if (trimmed.startsWith('*') && !trimmed.startsWith('*/')) {
      const text = trimmed.replace(/^\*+\s*/, '').replace(/\*+\/\s*$/, '').trim();
      // 跳过 @param / @return 等 javadoc 标签
      if (text && !text.startsWith('@') && !text.startsWith('<p>') && !text.startsWith('</p>')) {
        commentLines.unshift(text);
      }
      continue;
    }
    if (trimmed.startsWith('/**') || trimmed.startsWith('/*')) {
      const inline = trimmed.replace(/^\/\*+\s*/, '').replace(/\*+\/\s*$/, '').trim();
      if (inline && !inline.startsWith('@')) commentLines.unshift(inline);
      break;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
      commentLines.unshift(trimmed.replace(/^\/\/\s*|^#\s*/, '').trim());
      continue;
    }
    // 跳过注解行（如 @CustomResponseBody）继续向上搜索
    if (trimmed.startsWith('@')) continue;
    break;
  }

  return commentLines.filter(Boolean).join(' ').slice(0, 200);
}

/** 将 camelCase 方法名拆分为可读词组 */
function splitCamelCase(name: string): string[] {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/\s+/);
}

/** 从方法名推断接口用途（中文描述） */
function inferDescFromMethodName(methodName: string, httpMethod: string): string {
  const words = splitCamelCase(methodName);
  const verbMap: Record<string, string> = {
    list: '查询列表', get: '获取', query: '查询', find: '查找', search: '搜索',
    create: '创建', add: '新增', save: '保存', insert: '插入',
    update: '更新', modify: '修改', edit: '编辑', set: '设置',
    delete: '删除', remove: '移除', del: '删除',
    upload: '上传', download: '下载', export: '导出', import: '导入',
    check: '检查', verify: '验证', validate: '校验',
    send: '发送', submit: '提交', publish: '发布', deploy: '部署',
    start: '启动', stop: '停止', restart: '重启', run: '执行',
    enable: '启用', disable: '禁用', cancel: '取消',
    copy: '复制', clone: '克隆', move: '移动',
    bind: '绑定', unbind: '解绑', sync: '同步',
    count: '统计', stat: '统计', aggregate: '聚合',
    login: '登录', logout: '登出', register: '注册',
    reset: '重置', refresh: '刷新', retry: '重试',
    approve: '审批', reject: '驳回', revoke: '撤销',
    heartbeat: '心跳检测', ping: '连通检测', health: '健康检查',
  };

  // 第一个词作为动词
  const verb = verbMap[words[0]] ?? words[0];
  const rest = words.slice(1);

  // 常见介词/连接词翻译
  const prepMap: Record<string, string> = {
    by: '按', for: '用于', with: '含', without: '不含',
    and: '和', or: '或', to: '到', from: '从',
    all: '全部', page: '分页', detail: '详情', info: '信息',
    user: '用户', project: '项目', app: '应用', flow: '流程',
    node: '节点', agent: '代理', module: '模块', file: '文件',
    config: '配置', setting: '设置', status: '状态', type: '类型',
    name: '名称', id: '标识', list: '列表', tree: '树形',
    power: '权限', role: '角色', permission: '权限',
    version: '版本', history: '历史', log: '日志',
    available: '可用', enabled: '已启用', home: '主目录',
    dir: '目录', path: '路径', server: '服务', vnc: 'VNC',
    eda: 'EDA', modules: '模块列表', copy: '副本',
  };

  const translated = rest.map((w) => prepMap[w] ?? w).join('');
  return translated ? `${verb}${translated}` : verb;
}

/** 提取控制器类的 Javadoc 注释（类用途说明） */
function extractClassComment(content: string): string {
  const classIdx = content.search(/(?:public\s+)?class\s+\w+/);
  if (classIdx < 0) return '';
  return extractComment(content, classIdx, 10);
}

/** 从路径推断接口用途（兜底） */
function inferDesc(method: string, path: string): string {
  const seg = path.split('/').filter(Boolean).pop() ?? '';
  const clean = seg.replace(/[:{}\[\]]/g, '').replace(/[-_]/g, ' ');
  const verbMap: Record<string, string> = {
    GET: '查询', POST: '创建/提交', PUT: '更新', DELETE: '删除', PATCH: '修改',
  };
  const verb = verbMap[method] ?? '处理';
  return clean ? `${verb} ${clean}` : `${verb}请求`;
}

/** 提取 Spring 控制器类级别的 @RequestMapping 前缀 */
function extractClassPrefix(content: string): string {
  // 匹配 class 声明之前的 @RequestMapping("xxx") 或 @RequestMapping(value="xxx")
  const classRe = /@RequestMapping\(\s*(?:value\s*=\s*)?["']([^"']+)["']\s*\)[\s\S]*?(?:public\s+)?class\s+\w+/g;
  const m = classRe.exec(content);
  if (!m) return '';
  let prefix = m[1];
  if (!prefix.startsWith('/')) prefix = '/' + prefix;
  return prefix.replace(/\/$/, '');
}

/** 从方法匹配位置提取方法签名摘要（参数类型、返回类型） */
function extractMethodContext(content: string, matchIndex: number): string {
  const after = content.slice(matchIndex, matchIndex + 500);
  // 找到方法签名: public ReturnType methodName(ParamType param)
  const sigRe = /(?:public|private|protected)\s+[\w<>,\s?]+\s+(\w+)\s*\(([^)]*)\)/;
  const m = sigRe.exec(after);
  if (!m) return '';
  const methodName = m[1];
  const params = m[2].replace(/@\w+\s*/g, '').replace(/\s+/g, ' ').trim();
  // 简化参数显示
  const paramTypes = params.split(',').map((p) => {
    const parts = p.trim().split(/\s+/);
    return parts.length >= 2 ? parts.slice(0, -1).join(' ') : p.trim();
  }).filter(Boolean).join(', ');
  return paramTypes ? `${methodName}(${paramTypes})` : methodName + '()';
}

/** 构建实体类 → 表名映射 */
function buildClassToTableMap(files: FileInfo[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const f of files) {
    if (!f.content || f.ext !== '.java') continue;
    const classMatch = f.content.match(/(?:public|protected|private|abstract|final)\s+(?:(?:abstract|final|static)\s+)*class\s+(\w+)/);
    if (!classMatch) continue;
    const className = classMatch[1];

    const mpMatch = f.content.match(/@TableName\(\s*["'](\w+)["']\s*\)/);
    if (mpMatch) { map.set(className, [mpMatch[1]]); continue; }

    const jpaMatch = f.content.match(/@Table\(\s*(?:name\s*=\s*)?["'](\w+)["']/);
    if (jpaMatch) { map.set(className, [jpaMatch[1]]); continue; }

    if (/@Entity\b/.test(f.content) && !/@Table/.test(f.content) && !/@TableName/.test(f.content)) {
      const tableName = className.replace(/Entity$/, '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
      map.set(className, [tableName]);
    }
  }
  return map;
}

/** 构建接口名 → 实现类名映射（UserService → UserServiceImpl） */
function buildInterfaceImplMap(files: FileInfo[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const f of files) {
    if (!f.content || f.ext !== '.java') continue;
    // 支持泛型: class XxxImpl extends ServiceImpl<M, T> implements Yyy, Zzz
    const implRe = /class\s+(\w+)(?:\s+extends\s+[\w.<>,\s]+?)?\s+implements\s+([\w\s,]+)/g;
    let m;
    while ((m = implRe.exec(f.content)) !== null) {
      const implName = m[1];
      const ifaces = m[2].split(',').map((s) => s.trim()).filter(Boolean);
      for (const iface of ifaces) {
        const existing = map.get(iface) ?? [];
        existing.push(implName);
        map.set(iface, existing);
      }
    }
  }
  return map;
}

/** 构建类 → 注入依赖类名映射 */
function buildClassInjectionsMap(files: FileInfo[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const f of files) {
    if (!f.content || f.ext !== '.java') continue;
    const classMatch = f.content.match(/(?:public|protected|private|abstract|final)\s+(?:(?:abstract|final|static)\s+)*class\s+(\w+)/);
    if (!classMatch) continue;
    const className = classMatch[1];
    const injected: string[] = [];
    const lines = f.content.split('\n');

    // 逐行扫描：遇到 @Autowired/@Resource/@Inject 标记下一个字段声明
    let pendingInject = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (/@(?:Autowired|Resource|Inject)\b/.test(trimmed)) {
        pendingInject = true;
        // 同行声明: @Autowired private UserService userService;
        const inlineMatch = trimmed.match(/@(?:Autowired|Resource|Inject)(?:\([^)]*\))?\s+(?:private|protected|public)\s+(?:final\s+)?([\w<>]+)\s+\w+/);
        if (inlineMatch) {
          injected.push(inlineMatch[1].replace(/<.*>$/, ''));
          pendingInject = false;
        }
        continue;
      }
      if (pendingInject && /^(?:private|protected|public)\s+/.test(trimmed)) {
        const fieldMatch = trimmed.match(/(?:private|protected|public)\s+(?:final\s+)?([\w<>]+)\s+\w+/);
        if (fieldMatch) injected.push(fieldMatch[1].replace(/<.*>$/, ''));
        pendingInject = false;
        continue;
      }
      // 非注解、非空行重置标记
      if (pendingInject && trimmed && !trimmed.startsWith('@') && !trimmed.startsWith('//')) {
        pendingInject = false;
      }
    }

    // 直接扫描 private [final] XxxService xxxService 模式（含 Lombok @RequiredArgsConstructor）
    const svcFieldRe = /(?:private|protected|public)\s+(?:final\s+)?(\w+(?:Service|Mapper|Repository|Dao|Manager|Helper|Client|Facade|Delegate))\s+\w+\s*;/g;
    let m;
    while ((m = svcFieldRe.exec(f.content)) !== null) injected.push(m[1]);

    // 构造器注入（去除参数上的注解）
    const ctorRe = new RegExp(`(?:public|protected)\\s+${className}\\s*\\(([^)]+)\\)`, 'g');
    while ((m = ctorRe.exec(f.content)) !== null) {
      for (const p of m[1].split(',')) {
        const clean = p.trim().replace(/@\w+(?:\([^)]*\))?\s*/g, '');
        const typeMatch = clean.match(/^([\w<>]+)\s+\w+$/);
        if (typeMatch) injected.push(typeMatch[1].replace(/<.*>$/, ''));
      }
    }

    // MyBatis-Plus: extends ServiceImpl<UserMapper, User> → 提取 UserMapper 作为依赖
    const extendsRe = /extends\s+\w*(?:ServiceImpl|Service)\s*<\s*(\w+)/;
    const extendsMatch = f.content.match(extendsRe);
    if (extendsMatch) injected.push(extendsMatch[1]);

    if (injected.length > 0) map.set(className, [...new Set(injected)]);
  }
  return map;
}

/** 构建 Mapper/Repository → 表名映射 */
function buildMapperToTablesMap(files: FileInfo[], classToTable: Map<string, string[]>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const skipWords = new Set(['set', 'where', 'values', 'select', 'and', 'or', 'on', 'as', 'null', 'not', 'in', 'like']);

  for (const f of files) {
    if (!f.content) continue;

    // Java: interface UserMapper extends BaseMapper<User> / JpaRepository<User, Long> 等
    if (f.ext === '.java') {
      const mapperRe = /interface\s+(\w+)\s+extends\s+(?:[\w.]*?)(?:Mapper|Repository|Dao|CrudRepository|JpaRepository|PagingAndSortingRepository)\s*<\s*(\w+)/g;
      let m;
      while ((m = mapperRe.exec(f.content)) !== null) {
        const tables = classToTable.get(m[2]);
        if (tables) map.set(m[1], [...(map.get(m[1]) ?? []), ...tables]);
      }
    }

    // MyBatis XML: <mapper namespace="...UserMapper"> ... from table ...
    if (f.ext === '.xml' && f.content.includes('<mapper')) {
      const nsMatch = f.content.match(/<mapper\s+namespace=["']([^"']+)["']/);
      if (nsMatch) {
        const mapperName = nsMatch[1].split('.').pop() ?? '';
        const tableRe = /(?:from|into|update|join)\s+[`"']?(\w+)[`"']?/gi;
        let tm;
        const tables: string[] = [];
        while ((tm = tableRe.exec(f.content)) !== null) {
          if (!skipWords.has(tm[1].toLowerCase())) tables.push(tm[1]);
        }
        if (tables.length > 0) map.set(mapperName, [...new Set([...(map.get(mapperName) ?? []), ...tables])]);
      }
    }
  }
  return map;
}

/** BFS 解析类的关联表（Controller → Service → Mapper → Table） */
function resolveTablesForClass(
  className: string,
  classInjections: Map<string, string[]>,
  mapperToTables: Map<string, string[]>,
  classToTable: Map<string, string[]>,
  interfaceImplMap: Map<string, string[]>,
): string[] {
  const tables = new Set<string>();
  const visited = new Set<string>();
  const queue: { name: string; depth: number }[] = [{ name: className, depth: 0 }];

  while (queue.length > 0) {
    const { name, depth } = queue.shift()!;
    if (visited.has(name) || depth > 4) continue;
    visited.add(name);

    // 直接查表
    classToTable.get(name)?.forEach((t) => tables.add(t));
    mapperToTables.get(name)?.forEach((t) => tables.add(t));

    if (depth < 4) {
      // 查注入依赖
      const deps = classInjections.get(name);
      if (deps) {
        deps.forEach((dep) => queue.push({ name: dep, depth: depth + 1 }));
      }

      // 接口名 → 实现类名（UserService → UserServiceImpl）
      const impls = interfaceImplMap.get(name);
      if (impls) {
        impls.forEach((impl) => queue.push({ name: impl, depth: depth }));
      }

      // 命名约定兜底：XxxService → XxxServiceImpl
      if (!deps && !impls) {
        const conventionNames: string[] = [];
        if (!name.endsWith('Impl')) conventionNames.push(name + 'Impl');
        // IXxxService → XxxServiceImpl
        if (name.startsWith('I') && name[1]?.toUpperCase() === name[1]) {
          conventionNames.push(name.slice(1) + 'Impl');
        }
        for (const cn of conventionNames) {
          if (!visited.has(cn)) queue.push({ name: cn, depth: depth });
        }
      }
    }
  }
  return [...tables];
}

/** 扫描 API 端点 */
function scanApis(
  files: FileInfo[],
  projectPath: string,
  classInjections: Map<string, string[]>,
  mapperToTables: Map<string, string[]>,
  classToTable: Map<string, string[]>,
  interfaceImplMap: Map<string, string[]>,
): { method: string; path: string; file: string; desc: string; tables?: string[] }[] {
  const apis: { method: string; path: string; file: string; desc: string; tables?: string[] }[] = [];
  const seen = new Set<string>();

  function add(method: string, apiPath: string, rel: string, content: string, idx: number, classComment: string, controllerClass: string, tables: string[]) {
    const key = `${method} ${apiPath}`;
    if (seen.has(key)) return;
    seen.add(key);

    const comment = extractComment(content, idx);
    const methodCtx = extractMethodContext(content, idx);
    const methodName = methodCtx.replace(/\(.*$/, '');

    // 构建描述：业务说明 | 类上下文 → 类名.方法签名
    const parts: string[] = [];

    // 1) 方法注释 或 方法名推断
    if (comment) {
      if (classComment && !comment.includes(classComment)) {
        parts.push(`${comment} | ${classComment}`);
      } else {
        parts.push(comment);
      }
    } else if (methodName) {
      const inferred = inferDescFromMethodName(methodName, method);
      if (classComment) {
        parts.push(`${inferred} | ${classComment}`);
      } else {
        parts.push(inferred);
      }
    } else {
      parts.push(inferDesc(method, apiPath));
    }

    // 2) 方法签名（带类名前缀）
    if (methodCtx) {
      const prefix = controllerClass ? `${controllerClass}.` : '';
      parts.push(`→ ${prefix}${methodCtx}`);
    }

    apis.push({ method, path: apiPath, file: rel, desc: parts.join(' '), tables: tables.length > 0 ? tables : undefined });
  }

  for (const f of files) {
    if (!f.content) continue;
    const normalizedBase = projectPath.replace(/\\/g, '/').replace(/\/$/, '');
    const normalizedFile = f.path.replace(/\\/g, '/');
    const rel = normalizedFile.startsWith(normalizedBase)
      ? normalizedFile.slice(normalizedBase.length).replace(/^\//, '')
      : f.path;

    // 提取类名和类级别信息
    const classNameMatch = f.content.match(/(?:public|protected|private|abstract|final)\s+(?:(?:abstract|final|static)\s+)*class\s+(\w+)/);
    const controllerClassName = classNameMatch?.[1] ?? '';
    const classPrefix = extractClassPrefix(f.content);
    const classComment = extractClassComment(f.content);

    // 解析该控制器关联的数据库表
    const controllerTables = controllerClassName
      ? resolveTablesForClass(controllerClassName, classInjections, mapperToTables, classToTable, interfaceImplMap)
      : [];

    // Java Spring: @GetMapping("/path"), @PostMapping, @RequestMapping
    const classKeywordIdx = f.content.search(/\bclass\s+\w+/);
    const springRe = /@(Get|Post|Put|Delete|Patch|Request)Mapping\(\s*(?:value\s*=\s*)?["']([^"']+)["']/g;
    let m;
    while ((m = springRe.exec(f.content)) !== null) {
      if (m[1] === 'Request' && classKeywordIdx > 0 && m.index < classKeywordIdx) continue;
      const methodPath = m[2].startsWith('/') ? m[2] : '/' + m[2];
      const fullPath = classPrefix + methodPath;
      add(m[1] === 'Request' ? 'ANY' : m[1].toUpperCase(), fullPath, rel, f.content, m.index, classComment, controllerClassName, controllerTables);
    }

    // Express/Koa: router.get('/path'), app.post('/path')
    const expressRe = /(?:router|app|server)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g;
    while ((m = expressRe.exec(f.content)) !== null) {
      add(m[1].toUpperCase(), m[2], rel, f.content, m.index, '', controllerClassName, controllerTables);
    }

    // Python Flask/FastAPI: @app.route('/path'), @app.get('/path')
    const pyRe = /@(?:app|router|blueprint)\.(route|get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;
    while ((m = pyRe.exec(f.content)) !== null) {
      add(m[1] === 'route' ? 'ANY' : m[1].toUpperCase(), m[2], rel, f.content, m.index, '', controllerClassName, controllerTables);
    }

    // NestJS: @Get('/path'), @Post('/path')
    const nestRe = /@(Get|Post|Put|Delete|Patch)\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = nestRe.exec(f.content)) !== null) {
      add(m[1].toUpperCase(), m[2], rel, f.content, m.index, '', controllerClassName, controllerTables);
    }

    if (apis.length > 500) break;
  }
  return apis;
}

interface TableInfo {
  name: string;
  comment: string;
  fields: { name: string; type: string; comment: string }[];
}

/** 从 Java 实体类中提取字段信息（逐行解析，更可靠） */
function parseEntityFields(content: string): { name: string; type: string; comment: string }[] {
  const fields: { name: string; type: string; comment: string }[] = [];
  const lines = content.split('\n');
  let pendingComment = '';

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // 收集 Javadoc 注释
    if (trimmed.startsWith('/**')) {
      pendingComment = '';
      // 单行 Javadoc: /** xxx */
      if (trimmed.endsWith('*/')) {
        pendingComment = trimmed.replace(/^\/\*+\s*/, '').replace(/\s*\*+\/$/, '').trim();
      }
      continue;
    }
    if (trimmed.startsWith('*') && !trimmed.startsWith('*/')) {
      const text = trimmed.replace(/^\*+\s*/, '').trim();
      if (text && !text.startsWith('@') && !text.startsWith('<p>') && !text.startsWith('</p>')) {
        pendingComment += (pendingComment ? ' ' : '') + text;
      }
      continue;
    }
    if (trimmed === '*/') continue;

    // 跳过注解行
    if (trimmed.startsWith('@')) continue;

    // 匹配字段声明: private/protected Type fieldName;
    const fieldMatch = trimmed.match(/^(?:private|protected)\s+([\w<>,?\[\]\s]+?)\s+(\w+)\s*[;=]/);
    if (fieldMatch) {
      const type = fieldMatch[1].trim();
      const name = fieldMatch[2];
      if (name !== 'serialVersionUID') {
        fields.push({ name, type, comment: pendingComment.slice(0, 100) });
      }
      pendingComment = '';
      continue;
    }

    // 非注释、非注解、非字段行 → 清空待处理注释
    if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('import') && !trimmed.startsWith('package')) {
      pendingComment = '';
    }
  }
  return fields;
}

/** 扫描数据库表/实体，返回表名 + 字段详情 */
function scanDbTables(files: FileInfo[]): TableInfo[] {
  const tableMap = new Map<string, TableInfo>();

  for (const f of files) {
    if (!f.content) continue;
    let m;

    // 实体类解析：如果已有同名表但无字段，用实体字段覆盖
    function upsertTable(tableName: string, comment: string, fields: { name: string; type: string; comment: string }[]) {
      const existing = tableMap.get(tableName);
      if (existing && existing.fields.length > 0) return; // 已有字段，不覆盖
      tableMap.set(tableName, { name: tableName, comment: comment || existing?.comment || '', fields });
    }

    // MyBatis-Plus: @TableName("xxx") + 类注释 + 字段
    const mpRe = /@TableName\(\s*["'](\w+)["']\s*\)/g;
    while ((m = mpRe.exec(f.content)) !== null) {
      const classComment = extractComment(f.content, m.index, 10);
      const fields = parseEntityFields(f.content);
      upsertTable(m[1], classComment, fields);
    }

    // JPA/Hibernate: @Table(name="xxx")
    const tableRe = /@Table\(\s*(?:name\s*=\s*)?["'](\w+)["']/g;
    while ((m = tableRe.exec(f.content)) !== null) {
      const classComment = extractComment(f.content, m.index, 10);
      const fields = parseEntityFields(f.content);
      upsertTable(m[1], classComment, fields);
    }

    // @Entity class XxxEntity → 推断表名
    const entityRe = /@Entity[\s\S]*?class\s+(\w+)/g;
    while ((m = entityRe.exec(f.content)) !== null) {
      if (!f.content.includes('@Table') && !f.content.includes('@TableName')) {
        const tableName = m[1].replace(/Entity$/, '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
        const classComment = extractComment(f.content, m.index, 10);
        const fields = parseEntityFields(f.content);
        upsertTable(tableName, classComment, fields);
      }
    }

    // TypeORM: @Entity('xxx')
    const typeormRe = /@Entity\(\s*['"](\w+)['"]\s*\)/g;
    while ((m = typeormRe.exec(f.content)) !== null) {
      const fields = parseEntityFields(f.content);
      upsertTable(m[1], '', fields);
    }

    // SQL: CREATE TABLE xxx (col1 type, col2 type, ...)
    const sqlRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([\s\S]*?)\);/gi;
    while ((m = sqlRe.exec(f.content)) !== null) {
      const tableName = m[1];
      if (tableMap.has(tableName)) continue;
      const body = m[2];
      const sqlFields: { name: string; type: string; comment: string }[] = [];
      const colRe = /^\s*[`"']?(\w+)[`"']?\s+([\w()]+)/gm;
      let cm;
      while ((cm = colRe.exec(body)) !== null) {
        const colName = cm[1].toLowerCase();
        if (['primary', 'key', 'index', 'unique', 'constraint', 'foreign'].includes(colName)) continue;
        // 提取行内 COMMENT 'xxx'
        const lineEnd = body.indexOf('\n', cm.index);
        const line = body.slice(cm.index, lineEnd > 0 ? lineEnd : undefined);
        const commentMatch = /COMMENT\s+['"]([^'"]+)['"]/i.exec(line);
        sqlFields.push({ name: cm[1], type: cm[2], comment: commentMatch?.[1] ?? '' });
      }
      tableMap.set(tableName, { name: tableName, comment: '', fields: sqlFields });
    }

    // Prisma: model Xxx { field Type ... }
    if (f.ext === '.prisma' || f.path.includes('schema.prisma')) {
      const prismaRe = /model\s+(\w+)\s*\{([\s\S]*?)\}/g;
      while ((m = prismaRe.exec(f.content)) !== null) {
        const tableName = m[1];
        if (tableMap.has(tableName)) continue;
        const body = m[2];
        const pFields: { name: string; type: string; comment: string }[] = [];
        for (const line of body.split('\n')) {
          const pm = line.trim().match(/^(\w+)\s+([\w?[\]]+)/);
          if (pm) {
            const commentM = line.match(/\/\/\s*(.+)/);
            pFields.push({ name: pm[1], type: pm[2], comment: commentM?.[1] ?? '' });
          }
        }
        tableMap.set(tableName, { name: tableName, comment: '', fields: pFields });
      }
    }

    if (tableMap.size > 200) break;
  }

  // 补充：从 MyBatis XML 中发现的表（无字段信息）
  for (const f of files) {
    if (f.ext !== '.xml' || !f.content) continue;
    if (!f.content.includes('<mapper') && !f.content.includes('<select')) continue;
    const mbRe = /(?:from|into|update|join)\s+[`"']?(\w+)[`"']?/gi;
    let m;
    while ((m = mbRe.exec(f.content)) !== null) {
      const t = m[1];
      const tl = t.toLowerCase();
      if (['set', 'where', 'values', 'select', 'and', 'or', 'on', 'as', 'null', 'not', 'in', 'like'].includes(tl)) continue;
      if (!tableMap.has(t)) {
        tableMap.set(t, { name: t, comment: '', fields: [] });
      }
    }
    if (tableMap.size > 200) break;
  }

  return [...tableMap.values()];
}

/** 解析项目依赖 */
async function parseDependencies(
  projectPath: string,
  topFiles: string[],
  allFiles: FileInfo[],
): Promise<{ deps: { name: string; version: string }[]; frameworks: string[] }> {
  const deps: { name: string; version: string }[] = [];
  const frameworks: string[] = [];

  // package.json
  if (topFiles.includes('package.json')) {
    try {
      const raw = await readFile(join(projectPath, 'package.json'), 'utf-8');
      const pkg = JSON.parse(raw);
      const all = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const [name, ver] of Object.entries(all)) {
        deps.push({ name, version: String(ver) });
      }
      // 识别框架
      if (all['react']) frameworks.push('React');
      if (all['vue']) frameworks.push('Vue');
      if (all['@angular/core']) frameworks.push('Angular');
      if (all['next']) frameworks.push('Next.js');
      if (all['nuxt']) frameworks.push('Nuxt');
      if (all['express']) frameworks.push('Express');
      if (all['koa']) frameworks.push('Koa');
      if (all['@nestjs/core']) frameworks.push('NestJS');
      if (all['spring-boot'] || all['spring']) frameworks.push('Spring');
      if (all['tailwindcss']) frameworks.push('Tailwind CSS');
      if (all['prisma'] || all['@prisma/client']) frameworks.push('Prisma');
      if (all['typeorm']) frameworks.push('TypeORM');
      if (all['sequelize']) frameworks.push('Sequelize');
      if (all['mongoose']) frameworks.push('Mongoose');
      if (all['mybatis'] || all['mybatis-spring']) frameworks.push('MyBatis');
      if (all['vite']) frameworks.push('Vite');
      if (all['webpack']) frameworks.push('Webpack');
      if (all['electron']) frameworks.push('Electron');
    } catch { /* skip */ }
  }

  // pom.xml — 简单提取 artifactId
  if (topFiles.includes('pom.xml')) {
    try {
      const raw = await readFile(join(projectPath, 'pom.xml'), 'utf-8');
      const depRe = /<artifactId>([^<]+)<\/artifactId>/g;
      let m;
      while ((m = depRe.exec(raw)) !== null) {
        deps.push({ name: m[1], version: '' });
      }
      if (raw.includes('spring-boot')) frameworks.push('Spring Boot');
      if (raw.includes('mybatis')) frameworks.push('MyBatis');
      if (raw.includes('hibernate')) frameworks.push('Hibernate');
      if (raw.includes('spring-security')) frameworks.push('Spring Security');
      if (raw.includes('spring-cloud')) frameworks.push('Spring Cloud');
      if (raw.includes('dubbo')) frameworks.push('Dubbo');
    } catch { /* skip */ }
  }

  // build.gradle / build.gradle.kts — 顶层或子目录
  const gradleFiles: string[] = [];
  if (topFiles.includes('build.gradle')) gradleFiles.push(join(projectPath, 'build.gradle'));
  if (topFiles.includes('build.gradle.kts')) gradleFiles.push(join(projectPath, 'build.gradle.kts'));
  // 子目录中查找
  for (const f of allFiles) {
    const name = basename(f.path);
    if ((name === 'build.gradle' || name === 'build.gradle.kts') && !gradleFiles.includes(f.path)) {
      gradleFiles.push(f.path);
    }
  }
  for (const gf of gradleFiles) {
    try {
      const raw = await readFile(gf, 'utf-8');
      // 提取 implementation/compile 依赖
      const depRe = /(?:implementation|compile|api|runtimeOnly|compileOnly)\s*[('"]([^'"()]+)['")\s]/g;
      let m;
      while ((m = depRe.exec(raw)) !== null) {
        const parts = m[1].split(':');
        if (parts.length >= 2) {
          deps.push({ name: `${parts[0]}:${parts[1]}`, version: parts[2] ?? '' });
        }
      }
      // 识别框架
      if (raw.includes('spring-boot')) frameworks.push('Spring Boot');
      if (raw.includes('mybatis')) frameworks.push('MyBatis');
      if (raw.includes('hibernate')) frameworks.push('Hibernate');
      if (raw.includes('spring-security')) frameworks.push('Spring Security');
      if (raw.includes('spring-cloud')) frameworks.push('Spring Cloud');
      if (raw.includes('dubbo')) frameworks.push('Dubbo');
      if (raw.includes('redis') || raw.includes('jedis') || raw.includes('lettuce')) frameworks.push('Redis');
      if (raw.includes('mysql')) frameworks.push('MySQL');
      if (raw.includes('postgresql')) frameworks.push('PostgreSQL');
      if (raw.includes('kafka')) frameworks.push('Kafka');
      if (raw.includes('rabbitmq') || raw.includes('amqp')) frameworks.push('RabbitMQ');
      if (raw.includes('swagger') || raw.includes('springdoc')) frameworks.push('Swagger/OpenAPI');
    } catch { /* skip */ }
  }

  return { deps: deps.slice(0, 40), frameworks: [...new Set(frameworks)] };
}

/** 构建 Controller→Service→Mapper→Table 四层依赖图 */
function buildDependencyGraph(
  files: FileInfo[],
  classInjections: Map<string, string[]>,
  mapperToTables: Map<string, string[]>,
  classToTable: Map<string, string[]>,
  interfaceImplMap: Map<string, string[]>,
): DependencyGraph | undefined {
  const nodeMap = new Map<string, DepNode>();
  const edges: DepEdge[] = [];
  const edgeSet = new Set<string>();

  // Classify Java classes by annotation/naming
  const classCategory = new Map<string, 'controller' | 'service' | 'mapper'>();
  for (const f of files) {
    if (!f.content || f.ext !== '.java') continue;
    const cm = f.content.match(/(?:public|protected|private|abstract|final)\s+(?:(?:abstract|final|static)\s+)*(?:class|interface)\s+(\w+)/);
    if (!cm) continue;
    const name = cm[1];
    if (/@(?:RestController|Controller)\b/.test(f.content)) classCategory.set(name, 'controller');
    else if (/Service|Facade|Manager/.test(name)) classCategory.set(name, 'service');
    else if (/Mapper|Repository|Dao/.test(name)) classCategory.set(name, 'mapper');
  }

  function addNode(id: string, type: DepNode['type']) {
    if (!nodeMap.has(id)) nodeMap.set(id, { id, type });
  }
  function addEdge(s: string, t: string) {
    const key = `${s}->${t}`;
    if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ source: s, target: t }); }
  }

  // Add nodes and edges from classInjections
  for (const [cls, deps] of classInjections) {
    const srcType = classCategory.get(cls);
    if (!srcType) continue;
    addNode(cls, srcType);
    for (let dep of deps) {
      // Resolve interface → impl
      const impls = interfaceImplMap.get(dep);
      const resolved = impls?.[0] ?? dep;
      const depType = classCategory.get(resolved) ?? classCategory.get(dep);
      if (!depType) continue;
      addNode(resolved, depType);
      addEdge(cls, resolved);
    }
  }

  // Mapper → Table edges
  for (const [mapper, tables] of mapperToTables) {
    if (!classCategory.has(mapper) && !nodeMap.has(mapper)) continue;
    addNode(mapper, 'mapper');
    for (const t of tables) {
      addNode(t, 'table');
      addEdge(mapper, t);
    }
  }

  // Also from classToTable for mappers
  for (const [cls, tables] of classToTable) {
    if (classCategory.get(cls) === 'mapper' || nodeMap.get(cls)?.type === 'mapper') {
      for (const t of tables) {
        addNode(t, 'table');
        addEdge(cls, t);
      }
    }
  }

  const nodes = [...nodeMap.values()];
  return nodes.length > 0 ? { nodes, edges } : undefined;
}

export async function collectOverview(projectPath: string): Promise<ProjectOverview> {
  const dirName = basename(projectPath);

  // 收集顶层目录和文件
  let topEntries: Dirent[] = [];
  try { topEntries = await readdir(projectPath, { withFileTypes: true }); } catch { /* skip */ }

  const topDirs = topEntries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
    .map((e) => e.name)
    .slice(0, 15);

  const topFiles = topEntries.filter((e) => !e.isDirectory()).map((e) => e.name);

  // 遍历统计文件
  const fileStats = await walkFiles(projectPath);

  // 按扩展名汇总
  const extMap = new Map<string, number>();
  let totalLines = 0;
  for (const f of fileStats) {
    extMap.set(f.ext, (extMap.get(f.ext) ?? 0) + 1);
    totalLines += f.lines;
  }

  const fileBreakdown = [...extMap.entries()]
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // 构建依赖图用于 API → 表追踪
  const classToTable = buildClassToTableMap(fileStats);
  const classInjects = buildClassInjectionsMap(fileStats);
  const mapperToTables = buildMapperToTablesMap(fileStats, classToTable);
  const interfaceImplMap = buildInterfaceImplMap(fileStats);

  // 深度扫描：API 端点、数据库表、依赖
  const apis = scanApis(fileStats, projectPath, classInjects, mapperToTables, classToTable, interfaceImplMap);
  const dbTables = scanDbTables(fileStats);
  const { deps, frameworks } = await parseDependencies(projectPath, topFiles, fileStats);
  const dependencyGraph = buildDependencyGraph(fileStats, classInjects, mapperToTables, classToTable, interfaceImplMap);

  const lang = detectLanguage(fileBreakdown);
  const build = detectBuildTool(topFiles, fileStats);
  const parts = [
    `${dirName} 是一个基于 ${lang} 的项目`,
    build !== '未识别' ? `，使用 ${build} 构建` : '',
    frameworks.length > 0 ? `，技术栈包含 ${frameworks.join('、')}` : '',
    `。项目共有 ${fileStats.length} 个代码文件、约 ${totalLines.toLocaleString()} 行代码`,
    apis.length > 0 ? `，提供 ${apis.length} 个 API 端点` : '',
    dbTables.length > 0 ? `，涉及 ${dbTables.length} 张数据库表` : '',
    '。',
  ];

  return {
    description: parts.join(''),
    name: dirName,
    language: lang,
    buildTool: build,
    totalFiles: fileStats.length,
    totalLines,
    fileBreakdown,
    topDirs,
    apis,
    dbTables,
    dependencies: deps,
    frameworks,
    dependencyGraph,
  };
}
