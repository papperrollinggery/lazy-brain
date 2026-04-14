# LazyBrain — 实现规划 v2

> AI 编程智能体的能力知识图谱 + 语义路由器
> 状态：待审批

---

## Context

Claude Code 生态已有 212+ skill、194 agent、分布在 27 个目录路径下，但没有语义匹配机制。
用户必须记住 skill 名字或依赖仅覆盖 15 个关键词的 keyword-detector。
竞品调研确认：**市场空白，无直接竞品**。

**新发现**：本机已安装 `graphify`（Python，NetworkX），它做代码/文档 → 知识图谱 + 社区检测 + wiki 生成。
LazyBrain 可以借鉴其图结构 + wiki 模式，但面向完全不同的领域（能力路由 vs 代码理解）。

---

## 验证目的

| 验证项 | 假设 | 成功标准 |
|--------|------|----------|
| 语义匹配可行性 | embedding 能区分 200+ skill 的语义差异 | top-3 命中率 ≥ 80% |
| 延迟可接受 | 本地 embedding 足够快 | 端到端 < 200ms |
| 知识图谱价值 | 双向链接能发现"你不知道自己需要"的能力 | 组合推荐被采纳率 ≥ 50% |
| 多语言支持 | 中英文输入都能正确路由 | 中文查询命中率 ≥ 75% |

---

## 实现目标

**核心**：用户说一句话 → 自动找到并触发最相关的 1-3 个 skill/agent/command，
并展示相关能力的对比、组合推荐、以及未安装但可用的外部工具。

**关键能力**：
- 双向链接知识图谱：skill 之间的 similar_to / composes_with / supersedes 关系
- Wiki 编译：首次安装或新插件安装时，自动构建能力图谱
- 外部发现：从 GitHub / skills.sh 按星级和评价推送未安装的适配工具
- 跨生态搭配：ECC + OMC + Agent Agency + 插件系统统一路由
- 自我进化能力发现：帮用户发现 continuous-learning 等需要手动开启的能力
- 支持 Claude Code、OpenClaw、Hermes、Cursor、Kiro 等多客户端
- 开源核心 + 付费增值模块

---

## 技术选型

| 决策 | 选择 | 理由 |
|------|------|------|
| 语言 | TypeScript/Node.js | CC 生态一致，npm 分发，`npx` 即用 |
| 构建 | `tsup` (ESM + CJS) | 轻量，双格式输出 |
| 测试 | `vitest` | 快，TS 原生支持 |
| 许可 | MIT (核心) | 最大化采用 |

### 匹配引擎：三种模式（用户自选）

| 模式 | 编译时 | 查询时 | 依赖 | 适用场景 |
|------|--------|--------|------|----------|
| **LLM 编译**（默认推荐） | LLM 生成标签+关系+示例查询 | 纯字符串匹配 <10ms | 编译时需 LLM API | 最佳性价比 |
| **Embedding** | 生成向量 | cosine similarity <100ms | 本地模型 32-90MB | 离线优先 |
| **LLM 实时** | 无 | 每次调 LLM 1-3s | LLM API | 最高准确度 |

可混合使用：LLM 编译为主力 + Embedding 兜底 + LLM 实时作为付费超级模式。

**LLM 编译时的模型选择**：
- MiniMax 2.7（通过镜像接口）— 成本最低，212 skill × ~200 token ≈ 几毛钱
- 本地 Ollama 模型 — 零成本但需要本地部署
- Claude/OpenAI API — 质量最高但成本较高
- 用户通过 `lazybrain config set compileModel xxx` 自选

**Embedding 模型选择**（可选模块）：
- `fastembed` (32MB, bge-small-en-v1.5) — 默认
- `@huggingface/transformers` (90MB, all-MiniLM-L6-v2) — 备选
- `multilingual-e5-large` — CJK 字符自动切换
- OpenAI/Voyage API — 付费

---

## 架构

### 数据模型：能力知识图谱

不是扁平列表，而是双向链接的图结构（参考 graphify 的 NetworkX 模式）：

```
节点 (Capability)
├── id: string                    # sha256(kind:name:origin)
├── kind: skill | agent | command | mode | hook
├── name: string
├── description: string
├── origin: string                # ECC | OMC | plugin | external
├── status: installed | available | disabled
├── compatibility: string[]       # 适配平台 ["claude-code", "openclaw", "cursor", "kiro", "codex"]
├── filePath?: string             # 本地路径（installed 才有）
├── tags: string[]                # LLM 编译生成的语义标签
├── exampleQueries: string[]      # LLM 编译生成的示例查询
├── category: string              # 功能域分类
├── embedding?: number[384]       # 可选：语义向量（embedding 模式才有）
└── meta: { stars?, reviews?, url? }  # 外部能力的元数据

边 (Link) — 双向
├── similar_to      # 功能相似，需要对比（code-review ↔ ce-review）
│                   # 附带 diff 说明："ce-review 更结构化，多角色审查"
├── composes_with   # 可以搭配使用（plan + tdd-workflow）
├── supersedes      # 替代关系（continuous-learning-v2 → v1）
├── depends_on      # 依赖关系（prp-pr → git-workflow）
└── belongs_to      # 生态归属（council → ECC）
```

### Wiki 编译流程

```
┌──────────────────────────────────────────────────────────────┐
│                Wiki 编译（首次安装 / 新插件 / 手动触发）        │
│                                                              │
│  Scanner ──→ Parser ──→ Dedup ──→ LLM Compiler               │
│  (扫描文件)   (提取元数据)  (去重)    │                         │
│                                    │ 对每个 skill 生成：       │
│                                    ├── 语义标签 (tags)         │
│                                    ├── 示例查询 (exampleQueries)│
│                                    ├── 关系推断 (edges)        │
│                                    ├── 功能域分类 (category)    │
│                                    └── 场景描述                │
│                                    ↓                          │
│                              Graph Builder                    │
│                                    ↓                          │
│                              graph.json                       │
│                              (图结构 + 丰富元数据)              │
│                                                              │
│  可选：Embedding Indexer ──→ index.bin（向量索引）              │
└──────────────────────────────────────────────────────────────┘

编译成本估算（MiniMax 2.7）：
  212 skill × ~200 token/skill = ~42k token ≈ ¥0.3
  增量编译：只处理新增/变更的 skill
```

### 查询流程

```
┌──────────────────────────────────────────────────────────────┐
│  用户输入 ("我想设计一个网页 UI")                               │
│       │                                                      │
│       ▼                                                      │
│  Layer 0: Alias 精确匹配 (0ms)                                │
│  "疯狗模式" → ralph                                           │
│       │ 未命中                                                │
│       ▼                                                      │
│  Layer 1: 标签 + 示例查询匹配 (<10ms) ← LLM 编译的核心价值     │
│  分词 → 匹配 tags[] + exampleQueries[]                        │
│       │ top-k 候选                                            │
│       ▼                                                      │
│  Layer 2: Embedding 兜底 (可选, <100ms)                       │
│  当 Layer 1 置信度不够时启用                                    │
│       │                                                      │
│       ▼                                                      │
│  Graph Enrichment: 图遍历扩展 (<10ms)                         │
│  ├── similar_to → 对比推荐 + 区别说明                          │
│  ├── composes_with → 组合推荐                                 │
│  ├── supersedes → 版本提示                                    │
│  └── status=available → 外部推荐                              │
│       │                                                      │
│       ▼                                                      │
│  Layer 3: LLM 实时 Rerank (可选, <2s) ← 付费超级模式           │
│       │                                                      │
│       ▼                                                      │
│  输出：结构化推荐列表                                           │
│  格式兼容 keyword-detector hookOutput                         │
└──────────────────────────────────────────────────────────────┘
```

### 输出示例

```
用户: 我想设计一个网页 UI

LazyBrain 推荐：

  设计类：
  [1] frontend-design (93%) — 高质量前端界面设计 [ECC]
      特点：反模板策略，强调设计质量标准
  [2] frontend-slides (78%) — HTML 演示文稿 [ECC]
      特点：动画丰富，适合展示型页面
      ⚠ 与 [1] 功能相似但侧重不同：[1] 做产品页，[2] 做演示

  开发类：
  [3] frontend-patterns (85%) — React/Next.js 模式 [ECC]
      推荐组合：[1] + [3]（先设计再开发）

  审查类：
  [4] web-design-guidelines (72%) — UI 规范审查 [ECC]
      注意：审查已有代码，非从零创建

  未安装（GitHub ⭐ 1.2k）：
  [5] v0-integration — Vercel v0 AI UI 生成器
      安装：lazybrain install v0-integration
```

### 与 graphify 的关系

| 维度 | graphify | LazyBrain |
|------|----------|-----------|
| 输入 | 代码/文档文件 | SKILL.md / agent.md / command.md |
| 图的含义 | 代码实体关系 | 能力之间的语义关系 |
| 节点 | 函数/类/模块 | skill/agent/command/hook |
| 边的来源 | AST 分析 + LLM 推断 | frontmatter 提取 + 语义推断 |
| 查询方式 | BFS/DFS 遍历 | embedding 匹配 + 图遍历 |
| 输出 | 知识图谱 + wiki | 推荐列表 + 对比 |

**借鉴点**：
- 图结构用 JSON（类似 graphify 的 graph.json），不用 NetworkX（我们是 TS）
- Wiki 生成模式：index.md + 每个社区/分类一篇文章
- 社区检测思路：按功能域自动聚类（设计类、测试类、部署类...）
- BFS 遍历：从匹配节点出发，沿边发现相关能力

### 与 keyword-detector 共存

LazyBrain 不替代 keyword-detector，而是补充它：
- keyword-detector 处理 15 个硬编码模式关键词（ralph、autopilot 等），零延迟
- LazyBrain 处理长尾的 200+ skill 语义匹配
- Hook 执行顺序：keyword-detector 先跑，命中则 LazyBrain 跳过
- 输出格式复用 `createHookOutput({ continue: true, hookSpecificOutput: { additionalContext } })`

### 外部能力发现

可选功能（用户手动开启），数据源：
- **GitHub**：搜索 `topic:claude-code-skill` 或 `topic:agent-skill`，按星级排序
- **skills.sh**：agentskills.io 的 skill 注册表 API
- **npm registry**：搜索 `keywords:claude-code-skill`
- 缓存策略：每 24h 更新一次外部目录，存本地 `~/.lazybrain/external-catalog.json`
- 推送逻辑：当用户查询匹配到外部能力且本地无对应时，附加推荐

### 平台兼容性检测

Wiki 编译时自动标记每个能力的适配平台，避免推荐不兼容的工具：

```
检测逻辑：
1. 路径推断：
   ~/.claude/skills/       → claude-code
   ~/.claude/ecc/skills/   → claude-code (ECC 专属)
   ~/.claw/skills/         → openclaw
   .agents/skills/         → 多平台通用
   .kiro/skills/           → kiro
   .cursor/skills/         → cursor

2. Frontmatter 声明（如果有）：
   compatibility: ["claude-code", "openclaw"]

3. 内容分析（兜底）：
   - 引用了 Skill tool → claude-code
   - 引用了 MCP server → 多平台
   - 引用了 CC-specific hook → claude-code only

4. 查询时过滤：
   - 检测当前客户端（通过环境变量或配置）
   - 只推荐兼容当前平台的能力
   - 不兼容的标记为 "⚠ 仅限 [平台名]"
```

这个逻辑 Phase 1 先做路径推断（最简单），后续迭代加 frontmatter 声明和内容分析。

---

## 项目结构

```
lazybrain/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── LICENSE                        # MIT
├── bin/
│   └── lazybrain.ts               # CLI 入口
├── src/
│   ├── index.ts                   # 公共 API
│   ├── types.ts                   # 类型定义
│   ├── constants.ts               # 路径、阈值
│   ├── scanner/
│   │   ├── scanner.ts             # 扫描所有能力源
│   │   ├── parsers/
│   │   │   ├── skill-parser.ts    # SKILL.md frontmatter
│   │   │   ├── agent-parser.ts    # agents/*.md frontmatter
│   │   │   └── command-parser.ts  # commands/*.md frontmatter
│   │   └── dedup.ts               # 去重 (origin + name + path)
│   ├── compiler/                  # ★ 新增：LLM 编译器（核心）
│   │   ├── compiler.ts            # 编译编排（全量/增量）
│   │   ├── llm-provider.ts        # LLM 接口（MiniMax/Ollama/Claude/OpenAI）
│   │   ├── tag-generator.ts       # 生成语义标签 + 示例查询
│   │   ├── relation-inferrer.ts   # 推断 skill 间关系
│   │   └── category-classifier.ts # 功能域分类
│   ├── graph/                     # ★ 新增：图结构
│   │   ├── graph.ts               # 图的 CRUD + 遍历
│   │   ├── enricher.ts            # 查询时图遍历扩展
│   │   └── wiki-generator.ts      # Wiki 文章生成（参考 graphify）
│   ├── indexer/                   # 可选：embedding 模块
│   │   ├── indexer.ts             # embedding + 存储编排
│   │   ├── embeddings/
│   │   │   ├── provider.ts        # EmbeddingProvider 接口
│   │   │   ├── fastembed.ts       # 本地 fastembed
│   │   │   └── transformers.ts    # HF transformers
│   │   └── store.ts               # 向量存储 (二进制文件)
│   ├── matcher/
│   │   ├── matcher.ts             # 多层匹配编排
│   │   ├── alias-layer.ts         # Layer 0: 别名
│   │   ├── tag-layer.ts           # Layer 1: 标签+示例查询匹配（主力）
│   │   ├── semantic-layer.ts      # Layer 2: embedding 兜底（可选）
│   │   └── llm-reranker.ts        # Layer 3: LLM 实时（付费）
│   ├── config/
│   │   ├── config.ts              # 配置加载/保存
│   │   └── defaults.ts            # 默认值
│   ├── history/
│   │   └── tracker.ts             # 使用记录 + 学习
│   ├── external/                  # ★ 新增：外部能力发现
│   │   ├── github-discovery.ts    # GitHub 搜索
│   │   └── catalog.ts             # 外部目录缓存
│   └── hooks/
│       └── claude-code.ts         # CC hook 集成
├── test/
│   ├── scanner/
│   ├── compiler/
│   ├── matcher/
│   ├── graph/
│   ├── fixtures/                  # 测试用 SKILL.md 等
│   └── e2e/
└── docs/
    ├── BRAINSTORM.md
    └── PLAN.md
```

---

## 核心数据结构

```typescript
// 统一能力条目
interface Capability {
  id: string;              // sha256(kind:name:origin)
  kind: 'skill' | 'agent' | 'command' | 'mode' | 'alias';
  name: string;            // kebab-case 标识符
  description: string;     // 1-2 句描述
  origin?: string;         // 来源 (ECC, plugin 等)
  triggers?: string[];     // frontmatter triggers
  filePath: string;        // 原始文件路径
  embedding?: number[];    // 384-dim 向量
}

// 匹配结果
interface MatchResult {
  capability: Capability;
  score: number;           // 0-1 综合得分
  layer: 'alias' | 'keyword' | 'semantic' | 'llm';
  confidence: 'high' | 'medium' | 'low';
}

// 用户配置
interface UserConfig {
  aliases: Record<string, string>;     // "疯狗模式" → "ralph"
  scanPaths: string[];                 // 自定义扫描路径
  mode: 'auto' | 'select';
  autoThreshold: number;               // 默认 0.85
  embeddingProvider: 'fastembed' | 'transformers' | 'openai';
  language: 'auto' | 'en' | 'zh';
  autoSelectMultilingual: boolean;     // CJK 自动切换模型
}
```

---

## CLI 接口

```bash
# 核心命令
lazybrain match "帮我审查代码"          # 语义匹配，返回 top-3
lazybrain match "review this PR" -n 5   # 返回 top-5

# 索引管理
lazybrain scan                          # 扫描所有能力源
lazybrain index                         # 生成/更新 embedding 索引
lazybrain scan --paths ~/custom/skills  # 添加自定义路径
lazybrain list                          # 列出所有已索引能力
lazybrain stats                         # 统计信息

# 别名管理
lazybrain alias set "疯狗模式" ralph
lazybrain alias list
lazybrain alias remove "疯狗模式"

# 配置
lazybrain config set mode select
lazybrain config set autoThreshold 0.90
lazybrain config show

# Hook 安装
lazybrain hook install                  # 安装 CC UserPromptSubmit hook
lazybrain hook uninstall
```

---

## 存储位置

```
~/.lazybrain/
├── config.json          # 用户配置
├── registry.json        # 能力注册表 (扫描结果)
├── index.bin            # embedding 向量 (二进制)
├── history.jsonl        # 使用记录
└── models/              # 缓存的 embedding 模型
```

不放在 `~/.claude/` 内，保持独立性，支持多客户端。

---

## 分阶段实施（含模型分工）

### Phase 1 — MVP：扫描 + LLM 编译 + 标签匹配

**Opus 先行（骨架）：**
1. 项目脚手架 (package.json, tsconfig, tsup)
2. `types.ts` + `constants.ts` — 全局接口和常量
3. `compiler/llm-provider.ts` — LLM 抽象接口（支持 MiniMax/Ollama/Claude/OpenAI）
4. `compiler/compiler.ts` — 编译编排（全量/增量）
5. `graph/graph.ts` — 图 CRUD + BFS 遍历
6. `matcher/matcher.ts` + `matcher/tag-layer.ts` — 标签匹配核心
7. `scanner/dedup.ts` + `bin/lazybrain.ts` — 去重 + CLI 入口

**MiniMax 跟进（实现）：**
8. `utils/yaml.ts` — YAML frontmatter 解析
9. `scanner/parsers/skill-parser.ts` — SKILL.md 解析
10. `scanner/parsers/agent-parser.ts` + `command-parser.ts`
11. `scanner/scanner.ts` — 文件发现 + glob
12. `compiler/tag-generator.ts` — 调 LLM 生成标签
13. `compiler/relation-inferrer.ts` — 调 LLM 推断关系
14. `compiler/category-classifier.ts` — 功能域分类
15. `matcher/alias-layer.ts` — 别名匹配
16. `config/config.ts` + `defaults.ts` — 配置系统
17. CLI 子命令 (scan, compile, match, list)

**Opus 收尾：**
18. 审查所有 MiniMax 产出
19. 集成测试 + 对真实 212 skill 验证 top-3 命中率

**交付物**：`lazybrain compile && lazybrain match "帮我审查代码"` 返回正确结果

### Phase 2 — 图谱增强 + Hook 集成

**Opus：**
20. `graph/enricher.ts` — 查询时图遍历扩展（对比/组合/版本推荐）
21. `hooks/claude-code.ts` — Hook 集成 + keyword-detector 共存

**MiniMax：**
22. `graph/wiki-generator.ts` — Wiki 文章生成
23. `history/tracker.ts` — 使用记录
24. Alias CLI 命令
25. stats/config CLI 命令
26. e2e 测试

**Opus：**
27. 审查 + Hook 实测

### Phase 3 — 可选模块 + 外部发现

**MiniMax：**
28. `indexer/` 全部 — embedding 可选模块
29. `matcher/semantic-layer.ts` — embedding 兜底层
30. `external/github-discovery.ts` + `catalog.ts` — 外部能力发现
31. 平台兼容性检测逻辑
32. README + 文档

**Opus：**
33. 最终审查 + npm 发布配置

### Phase 4 — 付费模块（未来）

34. LLM 实时 reranker
35. Cloud API 服务
36. Team skill sharing
37. Analytics dashboard
38. `@lazybrain/pro` npm 包

---

## 付费边界设计

```
┌─────────────────────────────────────────────────┐
│                  lazybrain (MIT)                 │
│                                                 │
│  Scanner ─── Indexer ─── Matcher ─── CLI        │
│                │              │                  │
│           fastembed      alias+keyword+semantic  │
│           transformers                           │
│                                                  │
├─────────────────────────────────────────────────┤
│              @lazybrain/pro (付费)               │
│                                                 │
│  OpenAI embedding ── LLM reranker ── Cloud API  │
│  Team sharing ── Analytics ── Custom training    │
│  IDE 插件 (VS Code, JetBrains)                  │
└─────────────────────────────────────────────────┘
```

**核心原则**：本地跑的全部免费，需要云/API/团队协作的付费。

| 功能 | 免费 | 付费 |
|------|------|------|
| 本地 embedding 匹配 | ✅ | |
| 别名 + 关键词匹配 | ✅ | |
| CLI 工具 | ✅ | |
| CC Hook 集成 | ✅ | |
| 使用历史 + 学习 | ✅ | |
| 多语言支持 | ✅ | |
| OpenAI/Voyage embedding | | ✅ |
| LLM 超级模式 (rerank) | | ✅ |
| Cloud API (无需本地模型) | | ✅ |
| Team skill 共享 | | ✅ |
| 使用分析仪表板 | | ✅ |
| 自定义模型微调 | | ✅ |
| IDE 插件 | | ✅ |

---

## 关键文件参考

| 文件 | 用途 |
|------|------|
| `~/.claude/hooks/keyword-detector.mjs` | Hook 输出格式 + 共存逻辑参考 |
| `~/.claude/hooks/lib/config-dir.mjs` | `getClaudeConfigDir()` 路径解析复用 |
| `~/.claude/hooks/lib/stdin.mjs` | stdin 读取模式复用 |
| `~/.claude/ecc/skills/*/SKILL.md` | YAML frontmatter 格式参考 |
| `~/.claude/agents/*.md` | Agent 文件格式参考 |
| `~/.claude/commands/*.md` | Command 文件格式参考 |

---

## 验证方案

### MVP 验证 (Phase 1 完成后)

1. **准确率测试**：准备 50 个中英文查询 → 期望 skill 映射，跑 top-3 命中率
   - 目标：≥ 80%
   - 例："帮我审查代码" → code-review, ce-review, review-pr
   - 例："deploy this" → prp-pr, github-ops

2. **延迟测试**：100 次随机查询，测量 p50/p95/p99
   - 目标：p95 < 200ms (本地 embedding)

3. **去重验证**：531 SKILL.md → 应去重到 ~212 个
   - 验证翻译版本被正确跳过
   - 验证 origin 相同 + name 相同的被合并

### 集成验证 (Phase 2 完成后)

4. **Hook 测试**：在 Claude Code 中实际输入，验证 skill 被正确触发
5. **共存测试**：keyword-detector 关键词仍然正常工作
6. **别名测试**："疯狗模式" → ralph 正确触发

---

## 成本优化：任务路由策略

### 模型分工原则

你（用户）通过 MiniMax 2.7 镜像 Claude 接口，在同一 Claude Code 会话中混用两个模型。
核心原则：**Opus 做架构决策和复杂逻辑，MiniMax 做重复性编码和机械任务。**

### 模型能力边界

| 能力 | Opus (我) | MiniMax 2.7 (便宜模型) |
|------|-----------|----------------------|
| 架构设计 | ✅ 必须 | ❌ 不适合 |
| 接口定义 (types.ts) | ✅ 必须 | ❌ 容易偏 |
| 核心算法 (匹配逻辑) | ✅ 必须 | ❌ 不适合 |
| Hook 集成 (兼容性关键) | ✅ 必须 | ❌ 格式敏感 |
| 模板代码 (parser 实现) | ⚪ 可以 | ✅ 适合 |
| 测试用例编写 | ⚪ 可以 | ✅ 适合 |
| CLI 命令实现 | ⚪ 可以 | ✅ 适合 |
| 配置文件读写 | ⚪ 可以 | ✅ 适合 |
| 工具函数 (yaml, cosine) | ⚪ 可以 | ✅ 适合 |
| 文档编写 | ⚪ 可以 | ✅ 适合 |
| 代码审查 | ✅ 必须 | ❌ 不适合 |

### 具体任务路由

#### Opus 负责（不可降级）

| # | 任务 | 理由 |
|---|------|------|
| 1 | `types.ts` — 所有接口定义 | 全局契约，一错全错 |
| 2 | `constants.ts` — 路径、阈值 | 影响全局行为 |
| 3 | `compiler/compiler.ts` — 编译编排 | 核心流程，全量/增量逻辑 |
| 4 | `compiler/llm-provider.ts` — LLM 接口 | 多模型适配的抽象层 |
| 5 | `graph/graph.ts` — 图 CRUD + 遍历 | 核心数据结构 |
| 6 | `graph/enricher.ts` — 查询时图扩展 | 推荐逻辑的核心 |
| 7 | `matcher/matcher.ts` — 多层匹配编排 | 核心算法 |
| 8 | `matcher/tag-layer.ts` — 标签匹配（主力层） | 核心匹配逻辑 |
| 9 | `scanner/dedup.ts` — 去重逻辑 | 需要理解 27 种路径模式 |
| 10 | `hooks/claude-code.ts` — Hook 集成 | 必须兼容 keyword-detector |
| 11 | `bin/lazybrain.ts` — CLI 入口 | 整体编排 |
| 12 | 项目脚手架 (package.json, tsconfig, tsup) | 构建配置决策 |
| 13 | 代码审查所有 MiniMax 产出 | 质量把关 |

#### MiniMax 2.7 可做（机械性、有明确规范）

这些任务有清晰的输入输出规范，是模板化的实现工作：

| # | 任务 | 前置条件 | 交付规范 |
|---|------|----------|----------|
| A | `scanner/parsers/skill-parser.ts` | Opus 定义 `Capability` 接口 + SKILL.md 样本 | 输入: 文件路径 → 输出: `Capability` |
| B | `scanner/parsers/agent-parser.ts` | 同上 + agent.md 样本 | 同上 |
| C | `scanner/parsers/command-parser.ts` | 同上 + command.md 样本 | 同上 |
| D | `scanner/scanner.ts` — 文件发现 | Opus 定义扫描路径列表 | glob 扫描 + 调用 parser |
| E | `matcher/alias-layer.ts` | Opus 定义 `MatchResult` 接口 | 精确查找 |
| F | `compiler/tag-generator.ts` | Opus 定义 LLM prompt 模板 + 输出格式 | 调 LLM → 返回 tags + exampleQueries |
| G | `compiler/relation-inferrer.ts` | Opus 定义关系类型 + prompt 模板 | 调 LLM → 返回 edges |
| H | `compiler/category-classifier.ts` | Opus 定义分类体系 | 调 LLM → 返回 category |
| I | `graph/wiki-generator.ts` | Opus 定义 wiki 格式 | 生成 index.md + 分类文章 |
| J | `config/config.ts` + `defaults.ts` | Opus 定义 `UserConfig` 接口 | JSON 读写 |
| K | `history/tracker.ts` | Opus 定义历史记录格式 | JSONL 追加 + 读取 |
| L | `utils/yaml.ts` | 无 | YAML frontmatter 解析 |
| M | `indexer/` 全部（可选模块） | Opus 定义 `EmbeddingProvider` 接口 | embedding 实现 |
| N | `external/github-discovery.ts` | Opus 定义外部目录格式 | GitHub API 搜索 |
| O | `external/catalog.ts` | 同上 | 缓存管理 |
| P | CLI 子命令 (scan, compile, list, stats, alias, config) | Opus 完成 CLI 入口 | 按规范实现 |
| Q | 所有单元测试 | 对应模块完成后 | vitest 测试 |
| R | README.md | 项目完成后 | 文档 |

### 执行流程（成本最优顺序）

```
Phase 1 — Opus 先行（建立骨架）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 1: [Opus] 项目脚手架 + types.ts + constants.ts
Step 2: [Opus] provider.ts 接口 + store.ts + indexer.ts
Step 3: [Opus] matcher.ts + semantic-layer.ts
Step 4: [Opus] dedup.ts + hooks/claude-code.ts
Step 5: [Opus] bin/lazybrain.ts CLI 入口

Phase 1 — MiniMax 跟进（填充实现）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 6: [MiniMax] utils/yaml.ts + utils/cosine.ts
Step 7: [MiniMax] skill-parser.ts + agent-parser.ts + command-parser.ts
Step 8: [MiniMax] scanner.ts (文件发现)
Step 9: [MiniMax] alias-layer.ts + keyword-layer.ts
Step 10: [MiniMax] fastembed.ts (实现 provider 接口)
Step 11: [MiniMax] config.ts + defaults.ts
Step 12: [MiniMax] history/tracker.ts
Step 13: [MiniMax] CLI 子命令 (scan, list, stats, alias, config)

Phase 1 — Opus 收尾（审查 + 集成）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 14: [Opus] 审查所有 MiniMax 产出，修正问题
Step 15: [Opus] 集成测试 + 端到端验证

Phase 2+ — 同样模式
━━━━━━━━━━━━━━━━━━
[Opus] 定义接口 → [MiniMax] 实现 → [Opus] 审查
```

### 成本估算

假设 Opus token 成本 = 5x MiniMax：

| 角色 | 预估 token | 占比 |
|------|-----------|------|
| Opus (骨架 + 核心 + 审查) | ~40k output | ~35% 工作量 |
| MiniMax (实现 + 测试 + 文档) | ~80k output | ~65% 工作量 |

**等效成本**：如果全用 Opus = 120k × 5 = 600 单位。混用 = 40k×5 + 80k×1 = 280 单位。
**节省约 53%。**

### 给 MiniMax 的任务模板

每次交给 MiniMax 时，提供这个格式：

```markdown
## 任务：实现 [模块名]

### 接口契约（必须严格遵守）
[粘贴 types.ts 中的相关接口]

### 输入样本
[粘贴 1-2 个真实文件内容]

### 期望行为
- 输入 X → 输出 Y
- 边界情况：Z

### 约束
- 不要修改 types.ts
- 不要添加新依赖
- 使用 [具体函数] 来做 [具体事]

### 测试要求
- 写 vitest 测试覆盖正常路径 + 边界情况
```

---

## 项目名建议

**LazyBrain** — 懒人大脑
- 贴合"第二大脑"理念
- 暗示"你不需要记忆，我帮你想"
- npm 包名：`lazybrain`
- CLI 命令：`lazybrain` 或简写 `lb`
