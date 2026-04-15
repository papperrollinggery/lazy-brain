# Task: Hook 集成秘书层

## 背景

把秘书层（secretary.ts）集成进 hook 的三层匹配流程。
本地匹配置信度不足时，自动调用 MiniMax 秘书，把秘书的推荐结果格式化为 wiki card 注入给 Claude。

**前置条件：**
- task-v2-wiki-card.md 已完成
- task-v2-hook-wiki-card.md 已完成（formatWikiCard 已存在）
- task-v2-secretary-core.md 已完成（askSecretary 已存在）

## 步骤 1：修改 `bin/hook.ts`

### 1.1 新增 import

```typescript
import { askSecretary } from '../src/secretary/secretary.js';
```

### 1.2 修改 `main()` 函数

找到当前的置信度判断逻辑（`if (top.score < 0.4)`），在其后插入秘书层调用：

```typescript
    const top = result.matches[0];
    const allNodes = graph.getAllNodes();

    // ─── 三层决策 ────────────────────────────────────────────────────────

    // Layer 0/1 高置信度：直接注入 wiki card
    if (top.score >= 0.85) {
      const card = graph.getWikiCard(top.capability.id);
      const secondary = result.matches.slice(1, 3)
        .filter(m => m.score >= top.score * 0.8)
        .map(m => ({ name: m.capability.name, score: m.score }));
      const text = card
        ? formatWikiCard(card, top.score, secondary)
        : formatFallback(top, secondary);
      output({ continue: true, additionalSystemPrompt: text });
      return;
    }

    // 置信度太低且无秘书配置：不注入
    if (top.score < 0.4 && !config.compileApiBase) {
      output({ continue: true });
      return;
    }

    // Layer 2：秘书层（score 0.4-0.85，或 score<0.4 但有 API 配置）
    if (config.compileApiBase && config.compileApiKey) {
      // 把所有节点作为候选（秘书内部会取 top-20）
      // 优先用本地匹配结果排序，其余按 tier 补充
      const localMatches = result.matches.map(m => m.capability);
      const remaining = allNodes
        .filter(n => !localMatches.find(m => m.id === n.id))
        .filter(n => n.tier === undefined || n.tier <= 1);
      const candidates = [...localMatches, ...remaining];

      const secretaryResult = await askSecretary(prompt, candidates, {
        apiBase: config.compileApiBase,
        apiKey: config.compileApiKey ?? '',
        model: config.compileModel,
      });

      if (secretaryResult) {
        // 秘书返回了推荐，找到对应节点生成 wiki card
        const primaryNode = graph.findByName(secretaryResult.primary);
        if (primaryNode) {
          const card = graph.getWikiCard(primaryNode.id);
          const secondary = secretaryResult.secondary
            .map(name => graph.findByName(name))
            .filter((n): n is NonNullable<typeof n> => n !== null)
            .map(n => ({ name: n.name, score: secretaryResult.confidence * 0.9 }));

          const text = card
            ? formatWikiCard(card, secretaryResult.confidence, secondary) +
              `\n\n秘书分析: ${secretaryResult.plan}`
            : `[LazyBrain] 秘书推荐: /${secretaryResult.primary}\n${secretaryResult.plan}`;

          output({ continue: true, additionalSystemPrompt: text });
          return;
        }
      }
    }

    // Fallback：本地结果（score 0.4-0.85 且秘书失败/未配置）
    if (top.score >= 0.4) {
      const card = graph.getWikiCard(top.capability.id);
      const secondary = result.matches.slice(1, 3)
        .filter(m => m.score >= top.score * 0.8)
        .map(m => ({ name: m.capability.name, score: m.score }));
      const text = card
        ? formatWikiCard(card, top.score, secondary)
        : formatFallback(top, secondary);
      output({ continue: true, additionalSystemPrompt: text });
      return;
    }

    output({ continue: true });
```

### 1.3 新增 `formatFallback()` 函数

在 `formatWikiCard()` 后面新增：

```typescript
function formatFallback(
  top: { capability: { kind: string; name: string; scenario?: string }; score: number },
  secondary: Array<{ name: string; score: number }>,
): string {
  const lines = [
    `[LazyBrain] 推荐: ${top.capability.kind}/${top.capability.name} (${Math.round(top.score * 100)}%)`,
  ];
  if (top.capability.scenario) lines.push(`  适用场景: ${top.capability.scenario}`);
  if (secondary.length > 0) {
    lines.push(`  备选: ${secondary.map(m => `/${m.name}`).join(', ')}`);
  }
  return lines.join('\n');
}
```

## 步骤 2：验证

```bash
npm run build

# 测试高置信度路径（不调秘书）
echo '{"prompt":"/review-pr"}' | node dist/bin/hook.js

# 测试中置信度路径（应该调秘书，如果 API 可用）
echo '{"prompt":"帮我看看这段代码有没有问题"}' | node dist/bin/hook.js

# 测试低置信度路径（不注入）
echo '{"prompt":"今天天气怎么样"}' | node dist/bin/hook.js
```

## 注意事项

- `graph.findByName()` 是 O(n) 遍历，491 个节点可接受
- 秘书返回的 `primary` 名字可能和 graph 里的名字不完全匹配（大小写、连字符），需要容错
- 如果秘书返回的 primary 在 graph 里找不到，fallback 到本地 top 结果
- hook 是 fork 新进程，秘书的 circuit breaker 状态不持久，这是已知限制
