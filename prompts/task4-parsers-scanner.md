# MiniMax 2.7 任务提示词 — Task #4: 工具函数 + Parsers + Scanner

> 把这整个文件粘贴给 MiniMax。它包含所有接口契约、样本文件、和严格约束。

---

## 你的角色

你是 LazyBrain 项目的实现工程师。架构师（Opus）已经完成了核心骨架，你的任务是按照严格的接口契约实现以下模块：

1. `src/utils/yaml.ts` — YAML frontmatter 解析器
2. `src/scanner/parsers/skill-parser.ts` — SKILL.md 解析器
3. `src/scanner/parsers/agent-parser.ts` — Agent .md 解析器
4. `src/scanner/parsers/command-parser.ts` — Command .md 解析器
5. `src/scanner/scanner.ts` — 文件发现 + 扫描编排

---

## 绝对禁止

- **不要修改** `src/types.ts`、`src/constants.ts`、`src/graph/`、`src/compiler/`、`src/matcher/` 中的任何文件
- **不要添加新的 npm 依赖**（只用 Node.js 内置模块）
- **不要使用 `any` 类型**（用 `unknown` + 类型收窄）
- **不要创建** types.ts 中没有定义的新接口
- **不要写** console.log（除非在错误处理中用 console.error）
- **不要用** CommonJS（require/module.exports），全部用 ESM（import/export）
- 所有 import 路径必须以 `.js` 结尾（例如 `import { ... } from '../types.js'`）

---

## 接口契约（来自 types.ts，不可修改）

```typescript
export type CapabilityKind = 'skill' | 'agent' | 'command' | 'mode' | 'hook';

export type Platform =
  | 'claude-code'
  | 'openclaw'
  | 'cursor'
  | 'kiro'
  | 'codex'
  | 'opencode'
  | 'droid'
  | 'universal';

export interface CapabilityMeta {
  stars?: number;
  reviews?: number;
  url?: string;
  version?: string;
  lastUpdated?: string;
}

/**
 * Scanner 的输出类型。每个 parser 必须返回这个。
 */
export interface RawCapability {
  kind: CapabilityKind;
  name: string;
  description: string;
  origin: string;
  filePath: string;
  triggers?: string[];
  compatibility: Platform[];
  meta?: CapabilityMeta;
}
```

来自 constants.ts 的函数（直接 import 使用，不要重新实现）：

```typescript
import { getDefaultScanPaths, inferPlatformFromPath } from '../constants.js';
// getDefaultScanPaths() → string[]  返回所有默认扫描路径
// inferPlatformFromPath(filePath: string) → Platform[]  从路径推断平台兼容性
```

---

## 模块 1: `src/utils/yaml.ts`

### 功能

解析 Markdown 文件开头的 YAML frontmatter（`---` 包裹的部分）。

### 接口

```typescript
/**
 * 解析 YAML frontmatter。
 * 输入: 文件完整内容字符串
 * 输出: { frontmatter: Record<string, unknown>, body: string }
 *   - frontmatter: 解析后的 YAML 键值对
 *   - body: frontmatter 之后的正文内容
 * 如果没有 frontmatter，返回 { frontmatter: {}, body: 原始内容 }
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
};
```

### 约束

- **不要用第三方 YAML 库**。frontmatter 格式很简单，只需要处理：
  - `key: value`（字符串值）
  - `key: "quoted value"`（带引号的字符串）
  - 布尔值（true/false）
  - 数字
- 不需要处理嵌套对象、数组、多行值等复杂 YAML
- frontmatter 以第一行 `---` 开始，以第二个 `---` 结束

### 样本输入/输出

输入:
```
---
name: frontend-design
description: Create distinctive frontend interfaces
origin: ECC
trigger: "when building UI"
---

# Frontend Design

Use this when...
```

输出:
```json
{
  "frontmatter": {
    "name": "frontend-design",
    "description": "Create distinctive frontend interfaces",
    "origin": "ECC",
    "trigger": "when building UI"
  },
  "body": "\n# Frontend Design\n\nUse this when..."
}
```

输入（无 frontmatter）:
```
# Build and Fix

Incrementally fix build errors...
```

输出:
```json
{
  "frontmatter": {},
  "body": "# Build and Fix\n\nIncrementally fix build errors..."
}
```

### 测试要求

文件: `test/utils/yaml.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../src/utils/yaml.js';

describe('parseFrontmatter', () => {
  // 必须覆盖：
  // 1. 正常 frontmatter
  // 2. 无 frontmatter
  // 3. 空文件
  // 4. 带引号的值
  // 5. 布尔值和数字
  // 6. frontmatter 后有空行
});
```

---

## 模块 2: `src/scanner/parsers/skill-parser.ts`

### 功能

解析 SKILL.md 文件，提取 RawCapability。

### 接口

```typescript
import type { RawCapability } from '../../types.js';

/**
 * 解析一个 SKILL.md 文件。
 * @param filePath - 文件的绝对路径
 * @param content - 文件内容（调用方已读取）
 * @returns RawCapability 或 null（如果解析失败）
 */
export function parseSkill(filePath: string, content: string): RawCapability | null;
```

### SKILL.md 真实样本

样本 1（标准格式）:
```markdown
---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality.
origin: ECC
---

# Frontend Design

Use this when the task is not just "make it work" but "make it look designed."
```

样本 2（带 trigger）:
```markdown
---
name: continuous-learning-v2
description: Extract behavioral patterns from conversations
origin: ECC
trigger: "when writing new functions"
---

# Continuous Learning v2
```

样本 3（无 origin）:
```markdown
---
name: graphify
description: any input → knowledge graph
trigger: /graphify
---

# /graphify
```

### 解析规则

1. 用 `parseFrontmatter()` 提取 frontmatter
2. `name`: 从 frontmatter.name 取，如果没有则从文件路径推断（取父目录名）
3. `description`: 从 frontmatter.description 取，如果没有则取 body 第一段非标题文本
4. `origin`: 从 frontmatter.origin 取，如果没有则从路径推断：
   - 路径包含 `/ecc/` → "ECC"
   - 路径包含 `/plugins/` → "plugin"
   - 其他 → "local"
5. `triggers`: 从 frontmatter.trigger（单个字符串→数组）或 frontmatter.triggers（已是数组）
6. `compatibility`: 调用 `inferPlatformFromPath(filePath)`
7. `kind`: 固定为 `'skill'`
8. 如果 name 和 description 都提取不到，返回 null

### 测试要求

文件: `test/scanner/skill-parser.test.ts`，覆盖上面 3 个样本 + 无 frontmatter 的情况。

---

## 模块 3: `src/scanner/parsers/agent-parser.ts`

### 接口

```typescript
import type { RawCapability } from '../../types.js';

export function parseAgent(filePath: string, content: string): RawCapability | null;
```

### Agent .md 真实样本

```markdown
---
name: designer
description: UI/UX Designer-Developer for stunning interfaces (Sonnet)
model: claude-sonnet-4-6
level: 2
---

# Developer Agent Personality
```

```markdown
---
name: Senior Developer
description: Premium implementation specialist
color: green
emoji: 💎
vibe: Premium full-stack craftsperson
---

# Developer Agent Personality
```

### 解析规则

- 与 skill-parser 类似，但 `kind` 固定为 `'agent'`
- Agent 文件通常在 `~/.claude/agents/` 或 `~/.claude/ecc/agents/` 目录
- origin 推断：路径包含 `/ecc/` → "ECC"，其他 → "local"
- Agent 没有 trigger 字段

---

## 模块 4: `src/scanner/parsers/command-parser.ts`

### 接口

```typescript
import type { RawCapability } from '../../types.js';

export function parseCommand(filePath: string, content: string): RawCapability | null;
```

### Command .md 真实样本

样本 1（有 frontmatter）:
```markdown
---
description: Code review — local uncommitted changes or GitHub PR
argument-hint: [pr-number | pr-url | blank for local review]
---

# Code Review

> PR review mode adapted from PRPs-agentic-eng
```

样本 2（无 frontmatter）:
```markdown
# Checkpoint Command

Create or verify a checkpoint in your workflow.
```

### 解析规则

- `kind` 固定为 `'command'`
- `name`: 从 frontmatter.name 取，如果没有则从文件名推断（去掉 .md 后缀）
- `description`: 从 frontmatter.description 取，如果没有则取 body 第一段
- Command 文件通常在 `~/.claude/commands/` 目录
- **注意**：很多 command 没有 frontmatter，必须能处理这种情况

---

## 模块 5: `src/scanner/scanner.ts`

### 接口

```typescript
import type { RawCapability } from '../types.js';

export interface ScanOptions {
  /** 额外的扫描路径（追加到默认路径） */
  extraPaths?: string[];
  /** 进度回调 */
  onProgress?: (scanned: number, found: number) => void;
}

export interface ScanResult {
  capabilities: RawCapability[];
  scannedFiles: number;
  scannedPaths: number;
  errors: string[];
}

/**
 * 扫描所有能力源，返回去重后的 RawCapability 列表。
 */
export function scan(options?: ScanOptions): ScanResult;
```

### 实现逻辑

```
1. 获取扫描路径列表：
   paths = getDefaultScanPaths() + (options.extraPaths ?? [])

2. 对每个路径：
   a. 检查路径是否存在（不存在则跳过，不报错）
   b. 根据路径类型决定用哪个 parser：
      - 路径包含 "skills" → 递归查找 SKILL.md → 用 parseSkill
      - 路径包含 "agents" → 查找 *.md → 用 parseAgent
      - 路径包含 "commands" → 查找 *.md → 用 parseCommand
      - 路径包含 "plugins" → 递归查找 SKILL.md → 用 parseSkill
   c. 读取文件内容，调用对应 parser
   d. 收集结果

3. 调用 dedup() 去重（从 '../scanner/dedup.js' import）

4. 返回 ScanResult
```

### 文件发现规则

```typescript
// skills 目录：递归查找所有 SKILL.md
// 例如 ~/.claude/ecc/skills/frontend-design/SKILL.md
//      ~/.claude/ecc/skills/backend-patterns/SKILL.md

// agents 目录：直接查找 *.md（不递归子目录）
// 例如 ~/.claude/agents/designer.md
//      ~/.claude/ecc/agents/gan-planner.md

// commands 目录：直接查找 *.md（不递归子目录）
// 例如 ~/.claude/commands/code-review.md

// plugins 目录：递归查找 SKILL.md
// 例如 ~/.claude/plugins/marketplaces/.../SKILL.md
```

### 约束

- 用 `node:fs` 的 `readdirSync`、`readFileSync`、`existsSync`、`statSync`
- 用 `node:path` 的 `join`、`basename`、`resolve`
- 文件读取失败时记录到 errors 数组，不要抛异常
- import dedup: `import { dedup } from './dedup.js'`

### 测试要求

文件: `test/scanner/scanner.test.ts`

由于测试不能依赖真实文件系统，创建 fixture 文件：

```
test/fixtures/
├── skills/
│   ├── test-skill/
│   │   └── SKILL.md
│   └── no-frontmatter/
│       └── SKILL.md
├── agents/
│   └── test-agent.md
└── commands/
    ├── test-command.md
    └── no-frontmatter-command.md
```

测试时传入 `extraPaths` 指向 fixture 目录。

---

## 完成后的验证清单

在提交代码前，确认：

- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 所有测试通过
- [ ] 没有修改 types.ts、constants.ts 或任何 Opus 写的文件
- [ ] 没有添加新的 npm 依赖
- [ ] 所有 import 路径以 `.js` 结尾
- [ ] 没有使用 `any` 类型
- [ ] 没有使用 `require()` 或 `module.exports`

---

## 文件创建顺序

严格按这个顺序创建，因为后面的文件依赖前面的：

1. `src/utils/yaml.ts`
2. `test/utils/yaml.test.ts` → 运行测试确认通过
3. `src/scanner/parsers/skill-parser.ts`
4. `src/scanner/parsers/agent-parser.ts`
5. `src/scanner/parsers/command-parser.ts`
6. `test/scanner/skill-parser.test.ts` → 运行测试
7. `src/scanner/scanner.ts`
8. 创建 test fixtures
9. `test/scanner/scanner.test.ts` → 运行测试
10. `npx tsc --noEmit` → 确认零错误
