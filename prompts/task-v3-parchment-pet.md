# Task: 像素纸卷宠物 + ask模式 + 历史记录 + scan增量

## 背景

LazyBrain v2 核心三层 hook 架构已完成并验证（hook 延迟 ~50ms，CJK 匹配正常，秘书层 fallback 正常）。
本任务把剩余功能全部补齐，让项目达到可日常使用的完整状态。

**前置条件：** v2 所有任务已完成（secretary.ts、wiki card、graph 迁移、hook 安装）

---

## 步骤 1：扩展 MatchMode 类型

**文件：** `src/types.ts` 第 204 行

```typescript
// 改为：
export type MatchMode = 'auto' | 'select' | 'ask';
```

---

## 步骤 2：新建 `src/history/history.ts`

```typescript
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { HISTORY_PATH } from '../constants.js';
import type { HistoryEntry } from '../types.js';

export function loadRecentHistory(n: number): HistoryEntry[] {
  if (!existsSync(HISTORY_PATH)) return [];
  try {
    const lines = readFileSync(HISTORY_PATH, 'utf-8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(l => JSON.parse(l) as HistoryEntry);
  } catch {
    return [];
  }
}

export function appendHistory(entry: HistoryEntry): void {
  try {
    appendFileSync(HISTORY_PATH, JSON.stringify(entry) + '\n');
  } catch {
    // 写入失败不影响主流程
  }
}
```

---

## 步骤 3：bin/hook.ts — 新增像素纸卷宠物

在 `output()` 函数前，新增以下代码块：

### 3a. ParchmentScene 类型定义

```typescript
type ParchmentScene =
  | { type: 'hit_auto'; tool: string; score: number; secondary: Array<{name:string;score:number}>; model?: string }
  | { type: 'hit_ask';  tool: string; score: number; secondary: Array<{name:string;score:number}> }
  | { type: 'thinking'; topTool: string; score: number }
  | { type: 'secretary_done'; tool: string; score: number; plan: string }
  | { type: 'secretary_dead'; code: string; fallbackTool?: string; fallbackScore?: number }
  | { type: 'timeout'; fallbackTool?: string; fallbackScore?: number }
  | { type: 'circuit_breaker' }
  | { type: 'no_match' }
  | { type: 'no_graph' }
  | { type: 'sleeping' }
  | { type: 'omc_yield'; keyword: string }
  | { type: 'new_tools'; count: number };
```

### 3b. buildParchment() 函数

**关键：** `pad()` 必须正确处理 CJK 双宽字符（每个 CJK 字符占 2 列），否则边框对不齐。

```typescript
const PARCHMENT_WIDTH = 36; // 内容区宽度（列数）

function cjkLen(s: string): number {
  let len = 0;
  for (const c of s) {
    const cp = c.codePointAt(0) ?? 0;
    // CJK Unified Ideographs, CJK Symbols, Fullwidth, etc.
    len += (cp >= 0x1100 && cp <= 0x115F) ||
           (cp >= 0x2E80 && cp <= 0x303E) ||
           (cp >= 0x3040 && cp <= 0xA4CF) ||
           (cp >= 0xAC00 && cp <= 0xD7AF) ||
           (cp >= 0xF900 && cp <= 0xFAFF) ||
           (cp >= 0xFE10 && cp <= 0xFE1F) ||
           (cp >= 0xFE30 && cp <= 0xFE4F) ||
           (cp >= 0xFF00 && cp <= 0xFF60) ||
           (cp >= 0xFFE0 && cp <= 0xFFE6) ? 2 : 1;
  }
  return len;
}

function pad(s: string, w: number): string {
  const len = cjkLen(s);
  return s + ' '.repeat(Math.max(0, w - len));
}

function row(content: string): string {
  return `  │  ${pad(content, PARCHMENT_WIDTH)}│`;
}

function divider(): string {
  return `  ├${'─'.repeat(PARCHMENT_WIDTH + 2)}┤`;
}

function buildParchment(scene: ParchmentScene): string {
  const top    = `  ╭─ 📜 LazyBrain ${'─'.repeat(PARCHMENT_WIDTH - 13)}╮`;
  const bottom = `  ╰${'─'.repeat(PARCHMENT_WIDTH + 2)}╯`;
  const lines: string[] = [top];

  switch (scene.type) {
    case 'hit_auto':
      lines.push(row('(✿owo✿)  发现武器！'));
      lines.push(divider());
      lines.push(row(`▸ /${scene.tool}  [${Math.round(scene.score * 100)}%]`));
      for (const s of scene.secondary.slice(0, 2))
        lines.push(row(`▸ /${s.name}  [${Math.round(s.score * 100)}%]`));
      if (scene.model) {
        lines.push(row(''));
        lines.push(row(`🤖 ${scene.model}`));
      }
      lines.push(bottom);
      lines.push('  [自动模式] 已注入，Claude 正在决策...');
      break;

    case 'hit_ask':
      lines.push(row('(⊙ω⊙)?  快选！快选！'));
      lines.push(divider());
      lines.push(row(`▸ /${scene.tool}  [${Math.round(scene.score * 100)}%]`));
      for (const s of scene.secondary.slice(0, 2))
        lines.push(row(`▸ /${s.name}  [${Math.round(s.score * 100)}%]`));
      lines.push(row(''));
      lines.push(row(`💬 输入 /${scene.tool} 来使用`));
      lines.push(bottom);
      lines.push('  [询问模式] 等待你的指令...');
      break;

    case 'thinking':
      lines.push(row('(o~o?)  嗯...想一想'));
      lines.push(divider());
      lines.push(row(`▸ /${scene.topTool}  [${Math.round(scene.score * 100)}%]`));
      lines.push(row(''));
      lines.push(row('⟳ 秘书分析中...'));
      lines.push(bottom);
      break;

    case 'secretary_done':
      lines.push(row('(✧ω✧)  秘书说话了！'));
      lines.push(divider());
      lines.push(row(`▸ /${scene.tool}  [${Math.round(scene.score * 100)}%]`));
      lines.push(row(''));
      lines.push(row(`💡 ${scene.plan.slice(0, PARCHMENT_WIDTH - 3)}`));
      lines.push(bottom);
      break;

    case 'secretary_dead':
      lines.push(row('(×_×)  秘书...挂了'));
      lines.push(divider());
      lines.push(row(`❌ API 无响应 (${scene.code})`));
      lines.push(row('💀 秘书层已阵亡'));
      if (scene.fallbackTool) {
        lines.push(row(''));
        lines.push(row(`🔄 本地: /${scene.fallbackTool} [${Math.round((scene.fallbackScore ?? 0) * 100)}%]`));
      }
      lines.push(bottom);
      break;

    case 'timeout':
      lines.push(row('(>_<)  等太久了！'));
      lines.push(divider());
      lines.push(row('⏰ 秘书超时 (>2s)'));
      if (scene.fallbackTool)
        lines.push(row(`🔄 /${scene.fallbackTool} [${Math.round((scene.fallbackScore ?? 0) * 100)}%]`));
      lines.push(bottom);
      break;

    case 'circuit_breaker':
      lines.push(row('(╥_╥)  受伤了...'));
      lines.push(divider());
      lines.push(row('🛡️  熔断器已触发'));
      lines.push(row('连续失败 3 次，休息 10 分钟'));
      lines.push(row(''));
      lines.push(row('🔄 纯本地模式运行中'));
      lines.push(bottom);
      break;

    case 'no_match':
      lines.push(row('(´-ω-`)  没找到...'));
      lines.push(divider());
      lines.push(row('🔍 未找到匹配工具'));
      lines.push(row(''));
      lines.push(row('试试: lazybrain match "..."'));
      lines.push(bottom);
      break;

    case 'no_graph':
      lines.push(row('(;ω;)  好饿...没有武器库'));
      lines.push(divider());
      lines.push(row('⚠️  还没有武器图谱'));
      lines.push(row(''));
      lines.push(row('🍖 喂食: lazybrain compile'));
      lines.push(bottom);
      break;

    case 'sleeping':
      lines.push(row('(￣ω￣)  zZZ...'));
      lines.push(divider());
      lines.push(row('💤 这条不需要工具'));
      lines.push(bottom);
      break;

    case 'omc_yield':
      lines.push(row('(・ω・)ノ  OMC 先上！'));
      lines.push(divider());
      lines.push(row(`🤝 OMC 关键词: ${scene.keyword}`));
      lines.push(row('✋ LazyBrain 让路'));
      lines.push(bottom);
      break;

    case 'new_tools':
      lines.push(row('(★ω★)  发现新武器！'));
      lines.push(divider());
      lines.push(row(`🆕 新增 ${scene.count} 个工具待编译`));
      lines.push(row(''));
      lines.push(row('运行 lazybrain compile'));
      lines.push(row('让我进化！'));
      lines.push(bottom);
      break;
  }

  return lines.join('\n');
}

function renderParchment(scene: ParchmentScene): void {
  process.stderr.write('\n' + buildParchment(scene) + '\n');
}
```

### 3c. 在 main() 里插入渲染调用

**规则：只在 `config.mode === 'ask'` 时渲染纸卷。`auto` 模式保持静默（当前行为不变）。**

在 main() 里找到以下位置并插入：

1. **graph 不存在时**（第61行附近）：
```typescript
if (!existsSync(GRAPH_PATH)) {
  if (config?.mode === 'ask') renderParchment({ type: 'no_graph' });
  // ... 原有代码
}
```
注意：此时 config 可能还没加载，需要先 loadConfig()，或者在 no_graph 场景里不依赖 config。

2. **高置信度注入前**（第89-99行）：
```typescript
if (top.score >= 0.85) {
  const secondary = result.matches.slice(1, 3)
    .filter(m => m.score >= top.score * 0.8)
    .map(m => ({ name: m.capability.name, score: m.score }));
  
  if (config.mode === 'ask') {
    renderParchment({ type: 'hit_ask', tool: top.capability.name, score: top.score, secondary });
  } else if (config.mode === 'auto') {
    renderParchment({ type: 'hit_auto', tool: top.capability.name, score: top.score, secondary });
    // auto 模式也可以选择不渲染，看用户偏好
  }
  // ... 原有注入代码
}
```
**实际上 auto 模式不渲染**，只有 ask 模式渲染。代码简化为：
```typescript
if (config.mode === 'ask') {
  renderParchment({ type: 'hit_ask', tool: top.capability.name, score: top.score, secondary });
}
```

3. **进入秘书层前**（第108行）：
```typescript
if (config.mode === 'ask') {
  renderParchment({ type: 'thinking', topTool: top.capability.name, score: top.score });
}
```

4. **秘书成功后**（第121-138行）：
```typescript
if (secretaryResult) {
  if (config.mode === 'ask') {
    renderParchment({ type: 'secretary_done', tool: secretaryResult.primary, score: secretaryResult.confidence, plan: secretaryResult.plan });
  }
  // ... 原有注入代码
}
```

5. **秘书 API 错误**（在 askSecretary 的 catch 里，或检查 secretaryResult 为 null 时）：
secretary.ts 里已有 circuit breaker 逻辑，需要把错误类型传回来。
简化方案：在 hook.ts 的 catch 块里渲染：
```typescript
} catch (err: unknown) {
  const code = (err as any)?.status ?? 'ERR';
  if (config.mode === 'ask') {
    renderParchment({ type: 'secretary_dead', code: String(code), fallbackTool: top?.capability.name, fallbackScore: top?.score });
  }
}
```

6. **无匹配时**（第80-83行）：
```typescript
if (result.matches.length === 0) {
  if (config.mode === 'ask') renderParchment({ type: 'sleeping' });
  output({ continue: true });
  return;
}
```

7. **score < 0.4 跳过时**（第102-105行）：
```typescript
if (top.score < 0.4 && !config.compileApiBase) {
  if (config.mode === 'ask') renderParchment({ type: 'sleeping' });
  output({ continue: true });
  return;
}
```

### 3d. 历史记录接线

在 hook.ts 顶部 import：
```typescript
import { loadRecentHistory, appendHistory } from '../src/history/history.js';
```

在 `match()` 调用前：
```typescript
const history = loadRecentHistory(50);
const result = await match(prompt, { graph, config, embeddingProvider, history });
```

在每个成功注入后（三个注入点）追加历史：
```typescript
appendHistory({
  timestamp: new Date().toISOString(),
  query: prompt!,
  matched: top.capability.name,
  id: top.capability.id,
  accepted: true,
  layer: 'tag',  // 或 'secretary'（秘书层用 'llm'）
});
```

---

## 步骤 4：bin/lazybrain.ts — scan 增量感知

在 `cmdScan()` 函数末尾，保存 scan-cache.json **之前**，先读取旧缓存做对比：

```typescript
// 在 writeFileSync(scanCachePath, ...) 之前插入：
const oldCache: RawCapability[] = existsSync(scanCachePath)
  ? (() => { try { return JSON.parse(readFileSync(scanCachePath, 'utf-8')); } catch { return []; } })()
  : [];
const oldIds = new Set(oldCache.map((c: RawCapability) => c.id));
const newOnes = result.capabilities.filter(c => !oldIds.has(c.id));
const removed = oldCache.filter((c: RawCapability) => !result.capabilities.find(n => n.id === c.id));

// 然后保存
writeFileSync(scanCachePath, JSON.stringify(result.capabilities, null, 2));

// 然后输出增量信息
if (newOnes.length > 0) {
  console.log(`\n  🆕 新增 ${newOnes.length} 个工具:`);
  for (const c of newOnes.slice(0, 5)) console.log(`    + ${c.name}`);
  if (newOnes.length > 5) console.log(`    ... 还有 ${newOnes.length - 5} 个`);
  console.log(`\n  运行 lazybrain compile 来更新武器图谱`);
}
if (removed.length > 0) {
  console.log(`\n  🗑  移除 ${removed.length} 个工具`);
}
```

---

## 步骤 5：npm run build + 验证

```bash
cd /Users/jinjungao/work/lazy_user
npm run build

# 1. ask 模式纸卷（高置信度）
lazybrain config set mode ask
echo '{"prompt":"帮我审查代码"}' | node dist/bin/hook.js
# stderr 应显示 (⊙ω⊙)? 纸卷，stdout 仍是 JSON

# 2. 睡觉场景
echo '{"prompt":"好的"}' | node dist/bin/hook.js
# stderr 显示 (￣ω￣) zZZ

# 3. 疑惑场景
echo '{"prompt":"帮我优化一下"}' | node dist/bin/hook.js
# stderr 显示 (o~o?) + 秘书分析中

# 4. 历史记录
cat ~/.lazybrain/history.jsonl | tail -3

# 5. scan 增量
lazybrain scan
# 显示新增/移除工具数量

# 6. embedding 验证
lazybrain config set engine hybrid
echo '{"prompt":"帮我审查代码"}' | node dist/bin/hook.js
lazybrain config set engine tag

# 恢复默认
lazybrain config set mode auto

# 7. git commit
git add -A && git commit -m "feat: 像素纸卷宠物 + ask模式 + 历史记录 + scan增量"
```

---

## 注意事项

1. **CJK 宽度**：`cjkLen()` 必须覆盖常用 CJK 范围，否则纸卷边框错位
2. **ask 模式只渲染 stderr**，不改变 stdout JSON 协议，hook 协议不受影响
3. **历史写入 try/catch**，失败不能影响 hook 主流程
4. **scan 增量对比用 id 而不是 name**（name 可能重复）
5. **no_graph 场景**：config 可能还没加载，可以直接渲染不依赖 config，或者先 loadConfig() 再判断
6. **DEFAULT_CONFIG.mode 保持 `'select'`**，不改默认值，用户需要手动 `lazybrain config set mode ask` 开启
