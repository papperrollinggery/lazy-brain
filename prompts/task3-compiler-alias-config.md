# MiniMax 2.7 任务提示词 — Task #3: Compiler 子模块 + Alias Layer + Config

> 把这整个文件粘贴给 MiniMax。前置条件：Task #4 已完成。

---

## 你的角色

你是 LazyBrain 项目的实现工程师。架构师（Opus）已经完成了核心骨架，你的任务是按照严格的接口契约实现以下模块：

1. `src/compiler/tag-generator.ts` — 调用 LLM 生成语义标签
2. `src/compiler/relation-inferrer.ts` — 调用 LLM 推断能力间关系
3. `src/compiler/category-classifier.ts` — 功能域分类
4. `src/matcher/alias-layer.ts` — 别名精确匹配
5. `src/config/config.ts` — 配置加载/保存
6. `src/config/defaults.ts` — 默认配置
7. `src/graph/wiki-generator.ts` — Wiki 文章生成

---

## 绝对禁止

- **不要修改** `src/types.ts`、`src/constants.ts`、`src/graph/graph.ts`、`src/compiler/compiler.ts`、`src/compiler/llm-provider.ts`、`src/matcher/matcher.ts`、`src/matcher/tag-layer.ts` 中的任何文件
- **不要添加新的 npm 依赖**
- **不要使用 `any` 类型**
- **不要创建** types.ts 中没有定义的新 export 接口（内部 helper 类型可以）
- 所有 import 路径必须以 `.js` 结尾
- 全部用 ESM

---

## 接口契约

### 来自 types.ts（不可修改）

```typescript
export type CapabilityKind = 'skill' | 'agent' | 'command' | 'mode' | 'hook';

export type LinkType =
  | 'similar_to'
  | 'composes_with'
  | 'supersedes'
  | 'depends_on'
  | 'belongs_to';

export interface Link {
  source: string;
  target: string;
  type: LinkType;
  description?: string;
  diff?: string;
  confidence: number;
}

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

export interface LLMProvider {
  complete(prompt: string, systemPrompt?: string): Promise<LLMResponse>;
}

export interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export type MatchLayer = 'alias' | 'tag' | 'semantic' | 'llm';
export type Confidence = 'high' | 'medium' | 'low';

export interface MatchResult {
  capability: Capability;
  score: number;
  layer: MatchLayer;
  confidence: Confidence;
}

export interface UserConfig {
  aliases: Record<string, string>;
  scanPaths: string[];
  mode: 'auto' | 'select';
  autoThreshold: number;
  engine: 'tag' | 'embedding' | 'llm' | 'hybrid';
  compileModel: string;
  compileApiBase?: string;
  compileApiKey?: string;
  externalDiscovery: boolean;
  platform: Platform;
  language: 'auto' | 'en' | 'zh';
}
```

### 来自 constants.ts（直接 import 使用）

```typescript
import { DEFAULT_CONFIG, CONFIG_PATH, CATEGORIES, WIKI_DIR } from '../constants.js';
// DEFAULT_CONFIG: UserConfig  默认配置对象
// CONFIG_PATH: string  配置文件路径 (~/.lazybrain/config.json)
// CATEGORIES: readonly string[]  功能域分类列表
// WIKI_DIR: string  Wiki 输出目录
```

### 来自 compiler.ts（已实现，你的模块被它调用）

compiler.ts 已经包含了完整的 LLM prompt 模板和编译逻辑。你的 tag-generator、relation-inferrer、category-classifier 是**独立的工具函数**，可以被 compiler.ts 调用，也可以单独使用。

---

## 模块 1: `src/compiler/tag-generator.ts`

### 功能

给定一个 RawCapability，调用 LLM 生成语义标签和示例查询。

```typescript
import type { LLMProvider, RawCapability } from '../types.js';

export interface TagResult {
  tags: string[];
  exampleQueries: string[];
  scenario: string;
}

/**
 * 调用 LLM 为一个能力生成语义标签。
 * 如果 LLM 调用失败，返回基于 name/description 的降级结果。
 */
export async function generateTags(
  cap: RawCapability,
  llm: LLMProvider,
): Promise<TagResult>;
```

### 实现要点

- prompt 要求 LLM 返回 JSON：`{ tags: [...], exampleQueries: [...], scenario: "..." }`
- tags 应包含 8-15 个关键词，中英文混合（如果 description 包含 CJK 字符）
- exampleQueries 应包含 5-8 个用户可能的查询
- 降级逻辑：如果 LLM 失败，从 name 和 description 中提取关键词作为 tags
- 解析 LLM 返回时要处理 markdown code fence（```json ... ```）

---

## 模块 2: `src/compiler/relation-inferrer.ts`

### 功能

给定一个能力和一组候选能力，调用 LLM 推断它们之间的关系。

```typescript
import type { LLMProvider, RawCapability, Link } from '../types.js';

export interface InferredRelation {
  targetName: string;
  type: LinkType;
  description: string;
  diff?: string;
  confidence: number;
}

/**
 * 调用 LLM 推断一个能力与候选能力之间的关系。
 * 只返回 confidence >= 0.6 的关系。
 */
export async function inferRelations(
  cap: RawCapability,
  candidates: Array<{ name: string; description: string }>,
  llm: LLMProvider,
): Promise<InferredRelation[]>;
```

### 实现要点

- prompt 要求 LLM 返回 JSON 数组
- 过滤掉 confidence < 0.6 的结果
- 如果 LLM 失败，返回空数组（不抛异常）

---

## 模块 3: `src/compiler/category-classifier.ts`

### 功能

给定一个 RawCapability，确定它的功能域分类。

```typescript
import type { RawCapability } from '../types.js';
import { CATEGORIES } from '../constants.js';

/**
 * 基于规则的分类器（不需要 LLM）。
 * 从 name + description 中匹配关键词来确定分类。
 */
export function classifyCategory(cap: RawCapability): string;
```

### 分类规则（关键词映射）

```typescript
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'code-quality': ['review', 'lint', 'refactor', 'clean', 'quality', 'audit', '审查', '重构'],
  'testing': ['test', 'tdd', 'e2e', 'coverage', 'spec', 'assert', '测试'],
  'development': ['pattern', 'framework', 'frontend', 'backend', 'react', 'vue', 'node', '开发'],
  'deployment': ['deploy', 'ci', 'cd', 'pr', 'git', 'release', 'merge', '部署', '发布'],
  'design': ['design', 'ui', 'ux', 'slide', 'visual', 'css', 'layout', '设计', '界面'],
  'planning': ['plan', 'blueprint', 'prd', 'architecture', 'rfc', 'spec', '规划', '架构'],
  'research': ['search', 'research', 'analysis', 'explore', 'investigate', '研究', '分析'],
  'operations': ['devops', 'monitor', 'infra', 'docker', 'k8s', 'cloud', '运维'],
  'security': ['security', 'scan', 'vulnerability', 'auth', 'encrypt', '安全'],
  'content': ['write', 'article', 'blog', 'video', 'media', 'content', '写作', '内容'],
  'data': ['database', 'migration', 'sql', 'analytics', 'data', '数据'],
  'orchestration': ['agent', 'team', 'workflow', 'mode', 'orchestrat', '编排', '工作流'],
  'learning': ['learn', 'evolve', 'instinct', 'continuous', 'improve', '学习', '进化'],
  'communication': ['email', 'slack', 'notification', 'message', '通知', '消息'],
};
```

- 遍历 name + description 的小写形式，统计每个分类的关键词命中数
- 返回命中最多的分类
- 如果没有命中，返回 `'other'`

---

## 模块 4: `src/matcher/alias-layer.ts`

### 功能

别名精确匹配层。

```typescript
import type { Capability, MatchResult } from '../types.js';

/**
 * 检查用户输入是否匹配任何别名。
 * @param query - 用户输入
 * @param aliases - 别名映射 { "疯狗模式": "ralph", ... }
 * @param capabilities - 所有能力列表
 * @returns 匹配结果或 null
 */
export function aliasMatch(
  query: string,
  aliases: Record<string, string>,
  capabilities: Capability[],
): MatchResult | null;
```

### 实现要点

- query 转小写后检查是否包含任何 alias key（也转小写）
- 如果命中，在 capabilities 中找到对应的 name
- 返回 `{ capability, score: 1.0, layer: 'alias', confidence: 'high' }`
- 没命中返回 null

---

## 模块 5: `src/config/config.ts`

### 功能

配置文件的加载和保存。

```typescript
import type { UserConfig } from '../types.js';

/**
 * 加载用户配置。如果文件不存在，返回默认配置。
 */
export function loadConfig(): UserConfig;

/**
 * 保存用户配置。
 */
export function saveConfig(config: UserConfig): void;

/**
 * 更新配置中的单个字段。
 */
export function updateConfig(key: string, value: unknown): void;
```

### 实现要点

- 配置文件路径：`CONFIG_PATH`（从 constants.js import）
- 默认配置：`DEFAULT_CONFIG`（从 constants.js import）
- 加载时：读取 JSON → 与 DEFAULT_CONFIG 合并（用户配置覆盖默认值）
- 保存时：写入 JSON（pretty print，2 空格缩进）
- 目录不存在时自动创建

---

## 模块 6: `src/config/defaults.ts`

### 功能

导出默认配置的辅助函数。

```typescript
import type { UserConfig } from '../types.js';
import { DEFAULT_CONFIG } from '../constants.js';

/**
 * 获取默认配置的深拷贝。
 */
export function getDefaults(): UserConfig;

/**
 * 将用户配置与默认配置合并。
 */
export function mergeWithDefaults(partial: Partial<UserConfig>): UserConfig;
```

---

## 模块 7: `src/graph/wiki-generator.ts`

### 功能

从知识图谱生成 Wiki 文章（参考 graphify 的 wiki.py 模式）。

```typescript
import { Graph } from './graph.js';

export interface WikiOptions {
  outputDir?: string;  // 默认 WIKI_DIR
}

export interface WikiResult {
  articlesWritten: number;
  indexPath: string;
}

/**
 * 生成 Wiki：index.md + 每个分类一篇文章。
 */
export function generateWiki(graph: Graph, options?: WikiOptions): WikiResult;
```

### 输出格式

`index.md`:
```markdown
# LazyBrain Wiki

> 212 capabilities across 15 categories

## Categories

- [code-quality](code-quality.md) — 23 capabilities
- [design](design.md) — 18 capabilities
- [testing](testing.md) — 15 capabilities
...
```

`{category}.md`:
```markdown
# Code Quality

> 23 capabilities

## Skills

- **code-review** — Comprehensive code review [ECC]
  Tags: review, quality, PR, 审查
  Related: [[ce-review]] (similar), [[tdd-workflow]] (composes with)

- **ce-review** — Structured multi-role review [ECC]
  Tags: review, structured, multi-role
  Related: [[code-review]] (similar)

## Agents

- **reviewer** — Code review specialist
```

### 实现要点

- 用 `node:fs` 写文件
- `[[name]]` 格式的双向链接（Obsidian 兼容）
- 按 category 分组，每个 category 一个文件
- 每个能力列出 tags 和 related（从图的 links 中提取）
- 目录不存在时自动创建

---

## 完成后的验证清单

- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 所有测试通过
- [ ] 没有修改任何 Opus 写的文件
- [ ] 没有添加新的 npm 依赖
- [ ] 所有 import 路径以 `.js` 结尾

---

## 文件创建顺序

1. `src/compiler/tag-generator.ts`
2. `src/compiler/relation-inferrer.ts`
3. `src/compiler/category-classifier.ts`
4. `src/matcher/alias-layer.ts`
5. `src/config/defaults.ts`
6. `src/config/config.ts`
7. `src/graph/wiki-generator.ts`
8. 对应的测试文件
9. `npx tsc --noEmit` → 确认零错误
