# Task: embedding hybrid修复 + lazybrain-find + 历史boost可视化 + 模型推荐

## 背景

LazyBrain v2+纸卷宠物已完成并验证。本任务补齐最后 4 个功能，让项目达到完整可用状态。

**前置条件：** v3 纸卷宠物任务已完成（ask模式、历史记录、scan增量）

---

## 步骤 1：修复 embedding hybrid 模式

**文件：** `src/matcher/matcher.ts` 第 86-103 行

**问题：** hybrid 模式只在 `results[0].score < 0.5` 时才触发 embedding，但 tag 匹配通常 ≥ 0.5，导致 hybrid 实际上从不走 embedding 路径。

**修改：** 将条件从"tag 弱时才跑"改为"hybrid 模式始终跑并 merge"：

```typescript
// 改前：
if (
  (config.engine === 'embedding' || config.engine === 'hybrid') &&
  embeddingProvider
) {
  if (results.length === 0 || results[0].score < 0.5) {
    const semanticResults = await semanticMatch(query, allNodes, {
      provider: embeddingProvider,
      topK: MAX_RESULTS,
    });

    if (config.engine === 'hybrid') {
      results = mergeTagAndSemantic(results, semanticResults);
    } else {
      results = semanticResults;
    }
  }
}

// 改后：
if (
  (config.engine === 'embedding' || config.engine === 'hybrid') &&
  embeddingProvider
) {
  const semanticResults = await semanticMatch(query, allNodes, {
    provider: embeddingProvider,
    topK: MAX_RESULTS,
  });

  if (config.engine === 'hybrid' && semanticResults.length > 0) {
    results = mergeTagAndSemantic(results, semanticResults);
  } else if (config.engine === 'embedding') {
    results = semanticResults.length > 0 ? semanticResults : results;
  }
}
```

**注意：** embedding API 调用会增加 ~200-500ms 延迟。如果 hook 延迟超过 1s，可以在 `semanticMatch()` 调用外包一个 `Promise.race` 超时（500ms），超时则跳过 embedding 只用 tag 结果。

---

## 步骤 2：MatchResult 加 historyBoost 字段

**文件：** `src/types.ts` 第 118-125 行

在 `MatchResult` 接口里加可选字段：

```typescript
export interface MatchResult {
  capability: Capability;
  /** Combined score 0-1 */
  score: number;
  /** Which layer produced this match */
  layer: MatchLayer;
  confidence: Confidence;
  /** History boost applied (0-1), only set when boost > 0 */
  historyBoost?: number;
}
```

---

## 步骤 3：applyHistoryBoost() 写入 historyBoost 值

**文件：** `src/matcher/matcher.ts` 第 147-156 行

在 `applyHistoryBoost()` 的 map 里，把 boost 值写入 `historyBoost` 字段：

```typescript
const boosted = results.map(r => {
  const f = freq[r.capability.id] ?? freq[r.capability.name] ?? 0;
  if (f === 0) return r;

  const boost = HISTORY_BOOST_CAP * (f / maxFreq);
  return {
    ...r,
    score: Math.min(1, r.score + boost),
    historyBoost: boost,  // ← 新增这一行
  };
});
```

---

## 步骤 4：cmdMatch() 显示 ↑ 历史加权标记

**文件：** `bin/lazybrain.ts`，找到 `cmdMatch()` 函数里输出匹配结果的地方。

在显示每条匹配结果时，如果 `m.historyBoost && m.historyBoost > 0.01`，追加 `↑ 历史加权 +X%`：

```typescript
// 找到类似这样的输出行：
console.log(`  [${i + 1}] ${m.capability.name} (${Math.round(m.score * 100)}%) [${m.layer}]`);

// 改为：
const boostStr = m.historyBoost && m.historyBoost > 0.01
  ? ` ↑ 历史加权 +${Math.round(m.historyBoost * 100)}%`
  : '';
console.log(`  [${i + 1}] ${m.capability.name} (${Math.round(m.score * 100)}%) [${m.layer}]${boostStr}`);
```

---

## 步骤 5：新增 CAPABILITY_MODEL_HINTS 常量

**文件：** `src/constants.ts`，在文件末尾追加：

```typescript
// 已知需要特定模型的工具（手动维护，key 为 capability.name）
export const CAPABILITY_MODEL_HINTS: Record<string, string> = {
  'santa-loop': 'claude-opus-4-6',      // 双模型对抗审查，需要 Opus
  'ccg': 'claude-opus-4-6',             // 三模型编排
  'ultrawork': 'claude-opus-4-6',       // 最大并行执行
  'ralph': 'claude-opus-4-6',           // 持久化模式
  'deep-interview': 'claude-opus-4-6',  // 深度访谈
};
```

---

## 步骤 6：hook.ts 的 renderParchment 显示模型建议

**文件：** `bin/hook.ts`

### 6a. 在文件顶部 import 新常量

```typescript
import { CAPABILITY_MODEL_HINTS } from '../src/constants.js';
```

### 6b. 在 hit_ask 和 hit_auto 场景里显示模型建议

在 `buildParchment()` 的 `hit_ask` case 里，在 secondary 列表后面加模型提示：

```typescript
case 'hit_ask':
  lines.push(row('(⊙ω⊙)?  快选！快选！'));
  lines.push(divider());
  lines.push(row(`▸ /${scene.tool}  [${Math.round(scene.score * 100)}%]`));
  for (const s of scene.secondary.slice(0, 2))
    lines.push(row(`▸ /${s.name}  [${Math.round(s.score * 100)}%]`));
  lines.push(row(''));
  lines.push(row(`💬 输入 /${scene.tool} 来使用`));
  if (scene.model) {
    lines.push(row(''));
    lines.push(row(`🤖 建议: ${scene.model}`));
  }
  lines.push(bottom);
  lines.push('  [询问模式] 等待你的指令...');
  break;
```

注意：`hit_ask` 的 `ParchmentScene` 类型里已有 `model?: string` 字段（参考 `hit_auto`）。如果没有，需要在类型定义里加上。

### 6c. 在 main() 里传入 model 参数

在调用 `renderParchment({ type: 'hit_ask', ... })` 时，加上 model：

```typescript
const modelHint = CAPABILITY_MODEL_HINTS[top.capability.name];
if (config.mode === 'ask') {
  renderParchment({
    type: 'hit_ask',
    tool: top.capability.name,
    score: top.score,
    secondary,
    model: modelHint,  // ← 新增
  });
}
```

---

## 步骤 7：bin/lazybrain.ts 加 find 命令别名

**文件：** `bin/lazybrain.ts`，找到 switch/case 命令分发的地方，在 `match` case 附近加：

```typescript
case 'find':
  await cmdMatch(args[1]);
  break;
```

`lazybrain find "查询"` 等同于 `lazybrain match "查询"`，复用现有 cmdMatch 逻辑。

---

## 步骤 8：新建 lazybrain-find skill

**文件：** `~/.claude/skills/lazybrain-find/SKILL.md`（注意：这是用户主目录下的 claude 配置，不是项目目录）

```markdown
---
name: lazybrain-find
description: 主动查询 LazyBrain 武器库，根据意图推荐最合适的 skill 或 agent
aliases: [lbf, lb-find]
level: 1
---

# LazyBrain Find

当用户想主动查找工具时使用此 skill。

## 使用方式

调用此 skill 后，执行以下步骤：

1. 如果用户已在命令里提供了描述（如 `/lazybrain-find 代码审查`），直接使用该描述
2. 否则询问用户："你想做什么？请描述你的任务"
3. 运行 Bash 命令：`lazybrain match "<用户描述>"`
4. 根据返回结果，向用户展示推荐工具列表
5. 询问用户是否要使用推荐的工具

## 示例

用户: /lazybrain-find 我想做代码审查
→ 运行: lazybrain match "代码审查"
→ 展示: review-pr (92%), code-reviewer (78%), santa-loop (71%)
→ 询问: "要使用 /review-pr 吗？"

用户: /lbf
→ 询问: "你想做什么？请描述你的任务"
→ 用户: "帮我优化这段 SQL"
→ 运行: lazybrain match "优化 SQL"
→ 展示推荐列表
```

---

## 步骤 9：npm run build + 验证

```bash
cd /Users/jinjungao/work/lazy_user
npm run build

# 1. embedding hybrid 验证
lazybrain config set engine hybrid
lazybrain match "重构代码让它更简洁"
lazybrain match "refactor for readability"
lazybrain config set engine tag
# 对比两种模式结果，hybrid 应有更多语义相关结果

# 2. 历史 boost 可视化
# 先积累历史
echo '{"prompt":"帮我审查代码"}' | node dist/bin/hook.js > /dev/null
echo '{"prompt":"帮我审查代码"}' | node dist/bin/hook.js > /dev/null
echo '{"prompt":"帮我审查代码"}' | node dist/bin/hook.js > /dev/null
# 然后 match 看 ↑ 标记
lazybrain match "帮我审查代码"
# 应显示: [1] review-pr (92%) [tag] ↑ 历史加权 +X%

# 3. 模型推荐
echo '{"prompt":"santa loop 审查"}' | node dist/bin/hook.js 2>&1
# stderr 应显示 🤖 建议: claude-opus-4-6

# 4. lazybrain-find 命令
lazybrain find "代码审查"
# 应显示推荐列表（等同于 lazybrain match）

# 5. git commit
git add -A && git commit -m "feat: embedding hybrid修复 + lazybrain-find + 历史boost可视化 + 模型推荐"
```

---

## 注意事项

1. **embedding 延迟**：hybrid 模式始终调用 embedding API，会增加 ~200-500ms。如果 hook 总延迟超过 1s，考虑加 500ms 超时保护
2. **historyBoost 显示阈值**：只在 `historyBoost > 0.01` 时显示，避免噪音
3. **CAPABILITY_MODEL_HINTS key**：用 capability 的 `name` 字段（小写连字符），不是 id
4. **lazybrain-find skill 路径**：`~/.claude/skills/lazybrain-find/SKILL.md`，是用户主目录，不是项目目录
5. **hit_ask 的 model 字段**：检查 ParchmentScene 类型定义，`hit_ask` 可能已有 `model?: string`（参考 `hit_auto`），如果没有需要补上
