# Task: Phase 1 批量化 — 减少 LLM 调用次数

## 背景

当前 Phase 1 每个 capability 单独调一次 LLM（491 次调用）。大部分 capability 的 prompt 很短（name + description + triggers），完全可以批量处理。

## 目标

Phase 1 LLM 调用次数从 491 降到 ~100（每次处理 5 个 capability）。

## 修改文件

### 1. `src/compiler/compiler.ts` — 批量 tag prompt

新增批量 prompt 模板：

```ts
function makeBatchTagPrompt(caps: RawCapability[]): string {
  const items = caps.map((cap, i) => 
    `[${i + 1}] Name: ${cap.name}
Kind: ${cap.kind}
Description: ${cap.description}
${cap.triggers?.length ? `Triggers: ${cap.triggers.join(', ')}` : ''}`
  ).join('\n\n');

  return `Analyze these ${caps.length} AI coding agent capabilities and generate metadata for EACH.

${items}

Respond with a JSON array (one object per capability, in order):
[
  {
    "name": "capability-name",
    "tags": ["keyword1", "keyword2", ...],
    "exampleQueries": ["query1", "query2", ...],
    "category": "one-of: ${CATEGORIES.join(', ')}",
    "scenario": "one sentence: when to use this"
  },
  ...
]`;
}
```

### 2. `src/compiler/compiler.ts` — Phase 1 改为批量处理

当前是每个 capability 单独调 LLM。改为每 5 个一批：

```ts
const BATCH_SIZE = 5;

for (let i = 0; i < toCompile.length; i += BATCH_SIZE) {
  const batch = toCompile.slice(i, i + BATCH_SIZE);
  const batchRaws = batch.map(b => b.raw);
  
  const prompt = makeBatchTagPrompt(batchRaws);
  const response = await llm.complete(prompt, SYSTEM_PROMPT);
  totalTokens.input += response.inputTokens;
  totalTokens.output += response.outputTokens;
  
  const enrichments = parseJsonResponse<Array<{
    name: string;
    tags: string[];
    exampleQueries: string[];
    category: string;
    scenario: string;
  }>>(response.content);
  
  if (!enrichments || enrichments.length !== batchRaws.length) {
    // Fallback: 逐个重试
    for (const item of batch) {
      // ... 用原来的单个 prompt 逻辑
    }
    continue;
  }
  
  for (let j = 0; j < batch.length; j++) {
    const raw = batch[j].raw;
    const enrichment = enrichments[j];
    const id = makeCapabilityId(raw.kind, raw.name, raw.origin);
    
    graph.addNode({
      id,
      kind: raw.kind,
      name: raw.name,
      description: raw.description,
      origin: raw.origin,
      status: 'installed',
      compatibility: raw.compatibility,
      filePath: raw.filePath,
      tags: enrichment?.tags ?? [],
      exampleQueries: enrichment?.exampleQueries ?? [],
      category: enrichment?.category ?? 'other',
      scenario: enrichment?.scenario,
      triggers: raw.triggers,
      meta: raw.meta,
      tier: raw.tier,
    });
    compiled++;
    progressCount++;
    onProgress?.(progressCount + skipped, rawCapabilities.length, raw.name);
  }
}
```

### 3. `src/compiler/llm-provider.ts` — 降低 max_tokens

```ts
// 改 max_tokens: 2048 为：
max_tokens: 1024,  // 批量模式下 5 个 capability 的响应约 600-800 tokens
```

**注意：** 如果用单个 prompt 模式（fallback），max_tokens 512 就够。批量模式需要 1024。

### 4. 保留单个 prompt 作为 fallback

批量 prompt 可能因为 LLM 返回格式不对而失败（数组长度不匹配、JSON 解析失败等）。
失败时 fallback 到逐个处理，确保不丢数据。

## 注意事项

- 批量大小 5 是平衡点：太大 LLM 容易出错，太小省不了多少
- 批量 prompt 的 token 数约为单个的 5 倍，但省了 4 次 API 调用的 overhead
- 实际 token 节省约 30%（因为 system prompt 只发一次）
- 调用次数从 491 降到 ~100，API rate limit 压力大幅降低

## 验证

```bash
npm run build

# 需要 LLM API 可用时测试
lazybrain scan
lazybrain compile --force

# 观察：
# - Phase 1 进度条应该每次跳 5 个
# - 总调用次数应该 ~100 而不是 ~491
# - 如果某批失败，应该看到 fallback 到逐个处理的日志
```
