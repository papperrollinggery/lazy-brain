# Semantic Skill Router — 头脑风暴

> 项目代号：lazy_user（懒人路由器）
> 日期：2026-04-14
> 状态：头脑风暴阶段

---

## 1. 问题定义

Claude Code 生态中已安装 ~531 个 SKILL.md 文件（去重后约 212 个独立 skill），194 个 agent，
分布在 **27 个不同目录路径** 下。

现有触发方式全部依赖手动：
- `/skill-name` — 必须背名字
- frontmatter `triggers` — 实证不可靠（~50-80% 命中率）
- keyword-detector — 仅覆盖 ~15 个关键词
- Claude Code 内部匹配是关键词重叠，非语义理解

**用户痛点**：想用某个能力，但不知道叫什么、在哪里、怎么触发。

---

## 2. 现有生态调研

### 2.1 Skill 分布（实际扫描结果）

```
~/.claude/skills/                          # 主 skill 目录
~/.claude/skills-disabled/                 # 禁用的 skill
~/.claude/.agents/skills/                  # agent 内置 skill
~/.claude/ecc/skills/                      # ECC 框架 skill
~/.claude/ecc/.agents/skills/              # ECC agent skill
~/.claude/ecc/.claude/skills/              # ECC claude skill
~/.claude/ecc/.cursor/skills/              # Cursor 适配
~/.claude/ecc/.kiro/skills/                # Kiro 适配
~/.claude/ecc/docs/{lang}/skills/          # 多语言翻译版本
~/.claude/plugins/.../skills/              # 插件系统 skill
```

### 2.2 参考实现

| 现有方案 | 核心思路 | 局限 |
|----------|----------|------|
| wiki skill | keyword + tag 匹配，明确写了 "NO vector embeddings" | 不做语义 |
| knowledge-ops | 多层知识架构，MCP memory 做语义搜索 | 面向知识管理，非 skill 路由 |
| continuous-learning | Stop hook 提取 pattern → 存为 learned skill | 学习机制好，但不解决发现问题 |
| iterative-retrieval | 4 阶段渐进式上下文检索 | 面向代码文件，非 skill 匹配 |
| continuous-learning-v2 | instinct 原子行为 + 置信度 + 进化路径 | 学习框架，可借鉴置信度模型 |

### 2.3 关键洞察

- wiki 的 "NO vector embeddings" 是刻意选择（简单优先），但我们的场景需要语义
- iterative-retrieval 的渐进式检索思路可以借鉴（先粗筛再精排）
- continuous-learning-v2 的置信度 + 进化模型适合用户习惯学习
- knowledge-ops 的多层架构思路适合我们的"不动原始文件"需求

---

## 3. 设计方向

### 3.1 核心理念

**不动原始文件，只建索引** — 像搜索引擎一样，爬取 + 索引 + 查询。

兼容所有现有插件管理器（ECC、plugins、.agents 等），
用户装了什么就索引什么，不干预原始目录结构。

### 3.2 统一能力注册表

不只是 skill，统一索引所有"能力"：

| 能力类型 | 来源 | 元数据提取方式 |
|----------|------|---------------|
| skill | `**/SKILL.md` | YAML frontmatter (name, description, triggers) |
| agent | `~/.claude/agents/*.md` | 文件名 + 内容摘要 |
| command | `~/.claude/commands/*.md` | YAML frontmatter |
| hook | `settings.json` hooks 配置 | JSON 解析 |
| mode | 硬编码（autopilot, ralph, ultrawork 等） | 预定义 |
| alias | 用户自定义 | `user_config.json` |

### 3.3 三层匹配引擎

```
用户输入
    │
    ▼
┌─────────────────────────────────┐
│ Layer 0: Alias 精确匹配         │  ← "疯狗模式" → ralph（0ms）
│ (用户自定义别名，最高优先级)      │
└─────────────┬───────────────────┘
              │ 未命中
              ▼
┌─────────────────────────────────┐
│ Layer 1: 轻量过滤               │  ← keyword + fuzzy（<10ms）
│ (关键词 + 模糊匹配，缩小到 ~20)  │
└─────────────┬───────────────────┘
              │ 候选集
              ▼
┌─────────────────────────────────┐
│ Layer 2: 语义精排               │  ← embedding cosine（<100ms）
│ (向量相似度，取 top-3)           │     或 LLM 判断（<2s）
└─────────────────────────────────┘
```

### 3.4 三种模型可选

| 模式 | 引擎 | 延迟 | 成本 | 适用场景 |
|------|------|------|------|----------|
| 本地 embedding | all-MiniLM-L6-v2 (~80MB) | <100ms | 零 | MVP 默认 |
| API embedding | OpenAI/Voyage/Anthropic | <500ms | 低 | 无本地 GPU |
| LLM 超级模式 | Claude/GPT 做分类 | <2s | 中 | 最高准确度 |

用户可配置，默认本地 embedding，可选升级。

### 3.5 用户习惯系统

```json
{
  "aliases": {
    "疯狗模式": "ralph",
    "暴力测试": "ultraqa",
    "帮我发": "prp-pr"
  },
  "preferences": {
    "mode": "auto",           // "auto" | "select"
    "auto_threshold": 0.90,
    "language": "zh",
    "show_confidence": true
  },
  "history": []               // 使用记录，用于学习
}
```

### 3.6 两种交互模式

**自动模式**：置信度 > 阈值直接触发
```
用户: 疯狗模式搞定这个 feature
→ [自动触发 ralph]
```

**选择模式**：列出候选 + 组合推荐
```
用户: 帮我优化这段代码

找到 3 个相关能力：
  [1] refactor-clean (92%)
  [2] ai-slop-cleaner (87%)
  [3] simplify (85%)
  推荐组合: [1] + [3]
```

---

## 4. 技术选型（待定）

### 4.1 语言选择

优先考虑：
- **轻量** — 不引入重型运行时
- **跨平台** — macOS/Linux/Windows
- **生态兼容** — 能被 Claude Code hook 调用

候选：
| 语言 | 优势 | 劣势 |
|------|------|------|
| TypeScript/Node | CC 生态一致，npm 丰富 | Node 运行时较重 |
| Python | ML 生态最好，embedding 库多 | 需要 Python 环境 |
| Rust | 极快，单二进制，RTK 经验 | 编译慢，ML 生态弱 |
| Go | 单二进制，快 | ML 生态弱 |
| Shell + Python | Shell 做胶水，Python 做 ML | 两个依赖 |

**决策：TypeScript (Node.js)**

理由：
- `@xenova/transformers`（现已更名 `@huggingface/transformers`）可在 Node 跑本地 embedding，ONNX Runtime
- 与 Claude Code 生态一致（hook、MCP server 都是 Node/TS）
- npm 发布方便，用户 `npx` 即可运行
- aurelio-labs/semantic-router 也有 Node 移植版，可参考
- 未来做 MCP server 集成时零摩擦

### 4.2 Embedding 方案

本地优先：
- `sentence-transformers` + `all-MiniLM-L6-v2`（Python）
- `@xenova/transformers` + `all-MiniLM-L6-v2`（Node，ONNX Runtime）
- 或者用 `fastembed`（Rust binding，更轻量）

### 4.3 存储

- 注册表：`registry.json`（能力元数据）
- 向量：`embeddings.bin`（二进制向量文件）或 SQLite + 向量扩展
- 用户配置：`user_config.json`
- 使用历史：`usage_history.jsonl`

---

## 5. 跨客户端支持

目标：不只服务 Claude Code，也支持其他智能体客户端。

| 客户端 | 集成方式 |
|--------|----------|
| Claude Code | UserPromptSubmit hook |
| OpenClaw | CLI 调用 / API |
| Hermes | CLI 调用 / API |
| Cursor | 扩展 / CLI |
| Kiro | 扩展 / CLI |
| 通用 | CLI 独立运行 |

核心是 CLI 工具，hook 只是一种集成方式。

---

## 6. MVP 范围（建议）

Phase 1 — 最小可用：
- [ ] Scanner：扫描 `~/.claude/` 下所有 SKILL.md，提取 frontmatter
- [ ] Indexer：本地 embedding 向量化
- [ ] Matcher：用户输入 → top-3 匹配
- [ ] CLI：`lazy match "帮我审查代码"` → 返回结果
- [ ] Alias：基础别名支持

Phase 2 — 集成：
- [ ] Claude Code hook 集成
- [ ] Agent 索引
- [ ] Command 索引
- [ ] 选择模式 UI
- [ ] 使用历史记录

Phase 3 — 智能：
- [ ] 用户习惯学习（从历史推断偏好）
- [ ] 组合推荐（skill A + skill B）
- [ ] LLM 超级模式
- [ ] 多客户端 API

---

## 7. 竞品调研

### 7.0 本地已有工具：graphify

本机已安装 `graphify`（`/usr/local/bin/graphify`，Python 3.11），它做：
- 代码/文档 → NetworkX 知识图谱
- Leiden/Louvain 社区检测
- Wiki 生成（index.md + 社区文章 + god node 文章）
- BFS/DFS 图遍历查询，带 token 预算控制
- 多平台适配（claude, codex, opencode, claw, droid）

**与 LazyBrain 的关系**：不是竞品，是参考。graphify 面向代码理解，LazyBrain 面向能力路由。
但其图结构、wiki 模式、社区检测、多平台适配思路可以直接借鉴。

### 7.1 直接竞品（无）

**结论：目前没有直接竞品。** 没有任何开源、可用的工具专门解决"从大量 AI coding agent skill 中语义匹配用户意图"这个问题。

### 7.2 最接近的方案

| 项目 | 类型 | 匹配方式 | 与我们的差异 |
|------|------|----------|-------------|
| **aurelio-labs/semantic-router** (~10k⭐) | Python 库 | embedding 向量相似度 | 通用路由库，非 skill 专用，需手写 example utterances |
| **auto-claude-skills** (CC 插件) | CC 插件 | 评分引擎（不透明） | 社区插件，逻辑不透明，不可扩展 |
| **skillport** | MCP server | 关键词搜索 | 按需加载 skill，但不做语义匹配 |
| **agent-skills-cli** | CLI | 关键词 + 分类 | 面向 marketplace 搜索，非本地路由 |

### 7.3 学术研究（可借鉴架构）

| 论文/项目 | 核心思路 | 可借鉴点 |
|-----------|----------|----------|
| **ToolBench/ToolLLM** (ICLR'24, 5k⭐) | 16k API 中检索：BM25 + dense retrieval → LLM 选择 | 两阶段 retrieve-then-select 架构 |
| **Gorilla LLM** (11k⭐) | retriever-augmented tool selection | 检索增强 + 适应 API 变化 |
| **TaskMatrix** (Microsoft, 34k⭐) | embedding 相似度 → LLM rerank | API selector 组件设计 |
| **Skill Routing at Scale** (arxiv 2603.22455) | bi-encoder 检索 + cross-encoder 精排 | 最直接相关，13x 参数压缩 |
| **MCP-Zero** (arxiv 2506.01056) | agent 主动发现工具缺口 | 按需工具发现思路 |

### 7.4 间接参考（模型路由，非 skill 路由）

| 项目 | 做什么 | 为什么不是竞品 |
|------|--------|---------------|
| vLLM Semantic Router | 请求路由到不同 LLM | 路由模型，不路由 skill |
| RouteLLM (3k⭐) | 强/弱模型切换 | 成本优化，不做 skill 匹配 |
| Cursor model routing | 按复杂度选模型 | 模型路由，无 skill 生态 |

### 7.5 竞品分析结论

**市场空白确认**：

1. **aurelio-labs/semantic-router** 是最接近的通用库，但它需要手动为每个 route 写 example utterances。我们有 212+ skill 各自带 description，应该自动提取，不需要手写。
2. **学术界已验证** retrieve-then-rerank 是正确架构（ToolBench、Gorilla、arxiv 2603.22455），但没有面向 Claude Code/MCP 生态的实现。
3. **社区插件** (auto-claude-skills) 存在但不透明、不可扩展、不跨客户端。
4. **我们的差异化**：
   - 自动从 SKILL.md frontmatter 提取语义信息（零配置）
   - 支持 skill + agent + command + hook + mode 统一路由
   - 用户习惯学习 + 别名系统
   - 跨客户端（CC、OpenClaw、Hermes、Cursor、Kiro）
   - 开源、透明、可扩展

**做的必要性**：✅ 明确。这是一个被学术界验证了需求、但工程界尚无可用实现的空白。

---

## 8. 开放问题

1. **项目名**：lazy_user? skill-router? semantic-match? 需要一个好名字
2. **语言最终选择**：Python vs TypeScript vs 混合？
3. **embedding 模型大小**：80MB 的 MiniLM 可接受吗？有更小的选择吗？
4. **索引更新策略**：每次启动重建？增量更新？文件 watcher？
5. **多语言 skill 去重**：同一个 skill 有 zh-CN/ja-JP/ko-KR 翻译版，如何去重？
6. **置信度阈值**：自动触发的默认阈值设多少合适？0.85? 0.90? 0.95?
