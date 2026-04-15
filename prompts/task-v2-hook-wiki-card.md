# Task: Hook 升级 — Wiki Card 注入

## 背景

当前 `bin/hook.ts` 注入的是 5 行摘要，没有利用 graph 里已有的 compositions/comparisons/dependencies 数据。
本任务把 hook 的注入格式升级为"武器说明书"（wiki card），让 Claude 拿到完整的工具上下文。

**前置条件：** task-v2-wiki-card.md 已完成（`getWikiCard()` 方法已存在）

## 步骤 1：修改 `bin/hook.ts`

### 1.1 新增 import

在文件顶部 import 区域新增：
```typescript
import type { WikiCard } from '../src/types.js';
```

### 1.2 新增 `formatWikiCard()` 函数

在 `output()` 函数前新增：

```typescript
/**
 * 把 WikiCard 格式化为 Claude 可消费的 additionalSystemPrompt 文本。
 * 使用指令性语言提高 Claude 的采纳率。
 */
function formatWikiCard(card: WikiCard, score: number, secondaryMatches: Array<{ name: string; score: number }>): string {
  const cap = card.capability;
  const pct = Math.round(score * 100);
  const lines: string[] = [];

  lines.push(`[LazyBrain] 推荐方案 (${pct}% 置信度)`);
  lines.push('');
  lines.push(`主力工具: /${cap.name}`);
  if (cap.scenario) {
    lines.push(`  适用场景: ${cap.scenario}`);
  }
  lines.push(`  调用方式: Skill tool "${cap.name}" 或 /${cap.name}`);

  if (card.compositions.length > 0) {
    lines.push('');
    lines.push('推荐组合:');
    for (const c of card.compositions) {
      lines.push(`  /${cap.name} + /${c.name} — ${c.reason}`);
    }
  }

  if (card.comparisons.length > 0) {
    lines.push('');
    lines.push('相似工具对比:');
    for (const c of card.comparisons) {
      if (c.diff) {
        lines.push(`  vs /${c.name}: ${c.diff}`);
      }
    }
  }

  if (card.dependencies.length > 0) {
    lines.push('');
    lines.push('前置条件:');
    for (const d of card.dependencies) {
      lines.push(`  /${d.name}${d.description ? ` — ${d.description}` : ''}`);
    }
  }

  if (secondaryMatches.length > 0) {
    lines.push('');
    const altList = secondaryMatches.map(m => `/${m.name} (${Math.round(m.score * 100)}%)`).join(', ');
    lines.push(`备选: ${altList}`);
  }

  lines.push('');
  lines.push(`如果用户意图与上述工具匹配，请直接调用推荐的 skill。`);

  return lines.join('\n');
}
```

### 1.3 修改 `main()` 函数的注入逻辑

找到当前的注入逻辑（约第 83-122 行），替换为：

```typescript
    const top = result.matches[0];

    // 置信度太低，不注入
    if (top.score < 0.4) {
      output({ continue: true });
      return;
    }

    // 获取 wiki card（包含 compositions/comparisons/dependencies）
    const card = graph.getWikiCard(top.capability.id);

    // 备选匹配（score 在 top 的 80% 以上）
    const secondaryMatches = result.matches
      .slice(1, 3)
      .filter(m => m.score >= top.score * 0.8)
      .map(m => ({ name: m.capability.name, score: m.score }));

    let injectedText: string;

    if (card) {
      injectedText = formatWikiCard(card, top.score, secondaryMatches);
    } else {
      // fallback：card 获取失败时用旧格式
      const lines: string[] = [];
      lines.push(`[LazyBrain] 推荐: ${top.capability.kind}/${top.capability.name} (${Math.round(top.score * 100)}%)`);
      if (top.capability.scenario) lines.push(`  适用场景: ${top.capability.scenario}`);
      if (secondaryMatches.length > 0) {
        lines.push(`  备选: ${secondaryMatches.map(m => m.name).join(', ')}`);
      }
      injectedText = lines.join('\n');
    }

    output({
      continue: true,
      additionalSystemPrompt: injectedText,
    });
```

## 步骤 2：验证

```bash
npm run build

# 测试 hook 输出格式
echo '{"prompt":"帮我审查代码"}' | node dist/bin/hook.js

# 预期输出包含：
# [LazyBrain] 推荐方案 (XX% 置信度)
# 主力工具: /xxx
# 推荐组合: (如果有)
# 相似工具对比: (如果有)
# 如果用户意图与上述工具匹配，请直接调用推荐的 skill。
```

## 注意事项

- `getWikiCard()` 可能返回 null（节点不存在），必须有 fallback
- `formatWikiCard` 的输出长度控制在 600 tokens 以内（约 30 行）
- 不要修改 hook 的 stdin/stdout 协议，只改注入内容
