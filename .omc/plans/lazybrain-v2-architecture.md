# LazyBrain v2 — Agent for Agents 架构规划

## 定位

**LazyBrain = 专门为智能体服务的智能体（Agent for Agents）**

Claude Code 的第二大脑：不替代 Claude 思考，而是帮 Claude 记住"你有哪些武器、每个武器适合什么场景"，通过外置检索 + 秘书推荐，省掉 Claude 自己搜索工具的 token 消耗，提升已安装工具的利用率。

四个核心价值：
1. **技能 wiki 库** — 491 个 capability 的结构化语义索引（LLM 编译的核心资产）
2. **能力优化** — 帮 Claude 理解每个工具的适用场景和组合方式
3. **执行方案建议** — 根据用户意图推荐最优 skill 组合
4. **节省 token** — 外置检索省掉 Claude 自己推理工具的成本（ROI 约 15-30x）

---

## 现有资产（不动）

| 模块 | 状态 | 说明 |
|------|------|------|
| `lazybrain scan` | ✅ 完成 | 扫描 491 个 capability |
| `lazybrain compile` | ✅ 完成 | MiniMax-M2.7 生成 tags/scenario/relations |
| graph.json | ✅ 完成 | 491 nodes，787 links，含 embedding |
| tag-layer 匹配 | ✅ 完成 | alias → tag → semantic 三层 |
| CJK bridge | ✅ 完成 | 中英文语义桥接 |
| LLM provider | ✅ 完成 | OpenAI-compatible，已配置 MiniMax |

---

## v2 新增：三层 Hook 架构

```
UserPromptSubmit
    │
    ├─ [Layer 0] Alias 精确匹配 (<1ms)
    │     └─ score=1.0 → 注入 wiki card → 结束
    │
    ├─ [Layer 1] Tag 本地匹配 (<10ms)
    │     ├─ score ≥ 0.85 → 注入 wiki card → 结束
    │     ├─ score 0.5-0.85 → 进入 Layer 2
    │     └─ score < 0.5 → 进入 Layer 2（开放分析模式）
    │
    ├─ [Layer 2] 秘书层 MiniMax (~1s, timeout 2s)
    │     ├─ 输入: prompt + top-20 候选精简索引 (~1200 tokens)
    │     ├─ 输出: 推荐组合 + 执行方案建议 (JSON)
    │     ├─ timeout → fallback 到 Layer 1 结果
    │     └─ 注入 wiki card（含秘书建议）→ 结束
    │
    └─ 注入 additionalSystemPrompt → Claude 执行
```

---

## 注入格式升级：从"摘要"到"武器说明书"

### 当前（v1，太薄）
```
[LazyBrain] Relevant capability detected:
  skill/review-pr (92% match)
  When to use: ...
  Also consider: code-review
```

### v2 目标（wiki card 格式）
```
[LazyBrain] 推荐方案 (92% 置信度)

主力工具: /review-pr
  适用场景: 需要对 PR 做全面审查时，包含代码质量、安全性、可维护性
  调用方式: Skill tool "review-pr" 或 /review-pr

推荐组合:
  /review-pr + /security-review — 安全审查补充代码审查 (conf: 0.76)
  /review-pr + /verification-loop — 验证闭环集成到审查流程 (conf: 0.70)

相似工具对比:
  vs /code-review: review-pr 专注 PR 流程，code-review 更通用
  vs /santa-loop: santa-loop 是双模型对抗审查，成本更高但更严格

备选: /code-review (78%), /receiving-code-review (71%)
```

---

## 秘书层设计

### 输入（~1200 tokens）
```
用户意图: "{原始 prompt}"
任务类型: {code/planning/research/other}

候选能力 (本地预筛 top-20):
1. review-pr [code-quality] — 综合 PR 审查，含安全性
2. code-review [code-quality] — 代码质量检查
3. tdd-workflow [testing] — 测试驱动开发
...

请选择最佳 1-3 个能力组合，返回 JSON。
```

### 输出（JSON）
```json
{
  "primary": "review-pr",
  "secondary": ["security-review"],
  "plan": "先用 review-pr 做全面 PR 审查，发现安全问题后用 security-review 深入分析",
  "confidence": 0.88,
  "reasoning": "用户提到 PR 审查，review-pr 是最直接的匹配"
}
```

### 触发条件
- 本地匹配 score 0.5-0.85（不确定时）
- 本地匹配 score < 0.5（本地失败时）
- prompt 长度 ≥ 10 字符
- 同一 session 30s 内不重复调用（rate limit）

### 不触发条件
- score ≥ 0.85（本地已确定）
- prompt < 10 字符
- slash command 直接调用（alias 层已处理）

---

## Graph 增强：getWikiCard()

在 `src/graph/graph.ts` 新增方法，封装"给定 capability，返回完整上下文"：

```typescript
getWikiCard(nodeId: string): WikiCard | null {
  // name, description, scenario
  // composes_with 的伙伴列表 + reason
  // similar_to 的对比列表 + diff
  // depends_on 的前置条件
  // top-5 tags
}
```

hook 和 CLI 都复用这个方法，保证输出一致。

---

## 需要新增/修改的文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/secretary/secretary.ts` | 新增 | 秘书核心逻辑：构建 slim context、调用 MiniMax、解析响应 |
| `src/secretary/prompt-templates.ts` | 新增 | 秘书 prompt 模板（中英文） |
| `src/graph/graph.ts` | 修改 | 新增 `getWikiCard()` 方法 |
| `bin/hook.ts` | 修改 | 三层架构 + wiki card 注入 + 秘书层调用 |
| `src/types.ts` | 修改 | 新增 `WikiCard`、`SecretaryConfig`、`SecretaryResponse` |
| `src/constants.ts` | 修改 | 新增秘书相关阈值：`SECRETARY_THRESHOLD`、`SECRETARY_TIMEOUT_MS`、`SECRETARY_RATE_LIMIT_MS` |

**不需要修改：** scan、compiler、matcher、tag-layer、embedding、dedup、wiki-generator

---

## 风险与对策

| 风险 | 对策 |
|------|------|
| MiniMax thinking 延迟 700ms-2.5s | timeout 2s，超时 fallback 到本地结果 |
| 秘书建议被 Claude 忽略 | 注入语言改为指令性（参考 OMC 的 "You MUST"），高置信度时更强硬 |
| 与 OMC keyword-detector 冲突 | 检测 OMC 已覆盖的关键词，LazyBrain 跳过，只处理长尾 |
| API 不稳定 | circuit breaker：连续 3 次失败后暂停秘书层 10 分钟 |
| 成本失控 | rate limit：同 session 30s 内不重复调用秘书层 |

---

## 验证指标

- top-1 命中率 ≥ 80%（用户接受推荐的比例）
- hook 延迟：本地路径 <20ms，秘书路径 <2.5s
- 秘书建议采纳率 ≥ 60%（Claude 实际调用推荐 skill 的比例）
- 月度 MiniMax 成本 <50 元（按每天 100 次 prompt 估算）

---

## 实施顺序

1. **Task 1** — `getWikiCard()` + 类型定义（基础，其他任务依赖）
2. **Task 2** — hook 升级：wiki card 注入（立刻可见效果）
3. **Task 3** — 秘书层核心：secretary.ts + prompt-templates.ts
4. **Task 4** — hook 集成秘书层 + rate limit + circuit breaker
5. **Task 5** — graph 迁移：重新 save 生成拆分格式（meta + embeddings.bin）
6. **Task 6** — 安装 hook + 端到端验证
