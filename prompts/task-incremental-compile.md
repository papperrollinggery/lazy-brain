# Task: 增量编译修复 — Phase 2 关系缓存 + Phase 1 批量化

## 背景

当前增量编译是假的：
- Phase 1 确实跳过已编译的 node（通过 `existingGraph.getNode(id)` 检查）
- Phase 2 关系推断对**所有** node 重新跑 LLM，不管是新的还是旧的
- 加 1 个新 skill → Phase 1 只编译 1 个，Phase 2 跑 491 次 LLM 调用

## 目标

加 1 个新 skill 时，Phase 2 只对新 node + 它的 category 邻居做关系推断，不重跑全量。

## 修改文件

### 1. `src/compiler/compiler.ts` — Phase 2 增量逻辑

当前 Phase 2（约 226 行）：
```ts
const relationNodes = allNodes.filter(n => n.tier === undefined || n.tier <= 1);
for (let i = 0; i < relationNodes.length; i += concurrency) {
  // 对每个 node 都调 LLM
}
```

改为：
```ts
// 只对新编译的 node 做关系推断
const newNodeIds = new Set(newlyCompiledIds); // 从 Phase 1 收集
const relationNodes = allNodes.filter(n => 
  (n.tier === undefined || n.tier <= 1) && newNodeIds.has(n.id)
);
```

**具体改法：**

1. Phase 1 循环里收集新编译的 node ID：
```ts
const newlyCompiledIds: string[] = [];
// ... 在 graph.addNode 后面加：
newlyCompiledIds.push(id);
```

2. Phase 2 只处理新 node：
```ts
const relationNodes = newlyCompiledIds.length > 0
  ? allNodes.filter(n => newlyCompiledIds.includes(n.id))
  : []; // 没有新 node 就跳过 Phase 2
```

3. 如果 `--force` 参数，Phase 2 跑全量（保留现有行为）。

### 2. `src/compiler/compiler.ts` — CompileOptions 加 force 参数

```ts
export interface CompileOptions {
  // ... 现有字段
  /** Force full relation inference (not just new nodes) */
  forceRelations?: boolean;
}
```

### 3. `bin/lazybrain.ts` — 传 force 参数

```ts
const result = await compile(rawCapabilities, {
  // ... 现有参数
  forceRelations: args.includes('--force'),
});
```

### 4. `src/compiler/llm-provider.ts` — 降低 max_tokens

当前：
```ts
max_tokens: 2048,
```

改为：
```ts
max_tokens: 512,
```

Phase 1 的 JSON 响应通常 <300 tokens，Phase 2 的关系数组通常 <200 tokens。2048 浪费。

## 验证

```bash
npm run build

# 1. 全量编译
lazybrain compile --force --offline

# 2. 加一个新 skill（手动创建一个测试 skill）
mkdir -p ~/.claude/skills/test-skill
echo '---
name: test-skill
description: A test skill for incremental compile
---
# Test Skill' > ~/.claude/skills/test-skill/SKILL.md

# 3. 增量编译 — 应该只编译 1 个，Phase 2 只跑 1 个
lazybrain scan
lazybrain compile

# 4. 清理
rm -rf ~/.claude/skills/test-skill
```
