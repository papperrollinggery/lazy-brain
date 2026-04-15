# Task: WikiCard — Graph 增强 + 类型定义

## 背景

LazyBrain v2 的 hook 需要输出"武器说明书"格式的 wiki card，而不是当前的 5 行摘要。
graph.ts 需要新增 `getWikiCard()` 方法，封装从 graph 关系数据中提取完整上下文的逻辑。
这是其他所有 v2 任务的基础。

## 步骤 1：修改 `src/types.ts`

在文件末尾新增以下类型：

```typescript
// ─── Wiki Card ──────────────────────────────────────────────────────────────

/** 单个 capability 的完整上下文，用于 hook 注入和 CLI 展示 */
export interface WikiCard {
  /** 主 capability */
  capability: Capability;
  /** 推荐组合：composes_with 关系 */
  compositions: Array<{
    name: string;
    reason: string;
    confidence: number;
  }>;
  /** 相似工具对比：similar_to 关系 */
  comparisons: Array<{
    name: string;
    diff: string;
    confidence: number;
  }>;
  /** 前置依赖：depends_on 关系 */
  dependencies: Array<{
    name: string;
    description: string;
  }>;
}

// ─── Secretary ──────────────────────────────────────────────────────────────

export interface SecretaryConfig {
  /** 是否启用秘书层 */
  enabled: boolean;
  /** 触发秘书层的分数下限（低于此分数才调用秘书） */
  threshold: number;
  /** 超时时间（ms） */
  timeoutMs: number;
  /** 同 session 内最小调用间隔（ms） */
  rateLimitMs: number;
}

export interface SecretaryResponse {
  primary: string;
  secondary: string[];
  plan: string;
  confidence: number;
}
```

## 步骤 2：修改 `src/constants.ts`

在 `HISTORY_BOOST_CAP` 常量后面新增：

```typescript
/** 秘书层触发阈值：本地匹配低于此分数时调用 MiniMax */
export const SECRETARY_THRESHOLD = 0.85;
/** 秘书层超时（ms） */
export const SECRETARY_TIMEOUT_MS = 2000;
/** 秘书层 rate limit：同 session 内最小调用间隔（ms） */
export const SECRETARY_RATE_LIMIT_MS = 30000;
/** 秘书层 circuit breaker：连续失败次数上限 */
export const SECRETARY_CIRCUIT_BREAKER_LIMIT = 3;
/** 秘书层 circuit breaker：熔断后冷却时间（ms） */
export const SECRETARY_CIRCUIT_BREAKER_COOLDOWN_MS = 10 * 60 * 1000;
```

## 步骤 3：修改 `src/graph/graph.ts`

在 `getAllNodes()` 方法后面新增 `getWikiCard()` 方法：

```typescript
/**
 * 生成 capability 的完整 wiki card，包含关系上下文。
 * 用于 hook 注入和 CLI 展示。
 */
getWikiCard(nodeId: string): WikiCard | null {
  const cap = this.nodes.get(nodeId);
  if (!cap) return null;

  const adjacentLinks = this.adjacency.get(nodeId) ?? [];

  // composes_with → 推荐组合
  const compositions = adjacentLinks
    .filter(l => l.type === 'composes_with' && l.source === nodeId)
    .map(l => {
      const target = this.nodes.get(l.target);
      return target ? {
        name: target.name,
        reason: l.description ?? '',
        confidence: l.confidence,
      } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  // similar_to → 相似工具对比
  const comparisons = adjacentLinks
    .filter(l => l.type === 'similar_to')
    .map(l => {
      const otherId = l.source === nodeId ? l.target : l.source;
      const other = this.nodes.get(otherId);
      return other ? {
        name: other.name,
        diff: l.diff ?? l.description ?? '',
        confidence: l.confidence,
      } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  // depends_on → 前置依赖
  const dependencies = adjacentLinks
    .filter(l => l.type === 'depends_on' && l.source === nodeId)
    .map(l => {
      const target = this.nodes.get(l.target);
      return target ? {
        name: target.name,
        description: l.description ?? '',
      } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 3);

  return { capability: cap, compositions, comparisons, dependencies };
}
```

注意：需要在文件顶部的 import 里加上 `WikiCard`：
```typescript
import type { Capability, Link, CapabilityGraph, WikiCard } from '../types.js';
```

## 步骤 4：验证

```bash
npm run build
# 确认编译通过，无 TypeScript 错误
```

不需要运行时验证，这是纯类型 + 数据层改动。
