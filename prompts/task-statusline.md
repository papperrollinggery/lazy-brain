# Task: LazyBrain Statusline 集成

## 背景

LazyBrain 的纸卷宠物目前输出到 stderr，被 Claude Code 折叠了用户看不到。需要改为通过 Claude Code 的 statusline 机制显示，让推荐结果一直可见在输入框上方。

## 步骤 1：hook 写入 last-match.json

修改 `bin/hook.ts`，在每次 `output()` 调用之前，把匹配结果写入 `~/.lazybrain/last-match.json`。

在文件顶部 import 区域补充（如果还没有）：
```typescript
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
```

在所有 `output(...)` 调用之前（高置信度路径、低置信度路径、无匹配路径都要覆盖），写入文件：

有匹配时：
```typescript
const lastMatchPath = join(LAZYBRAIN_DIR, 'last-match.json');
try {
  writeFileSync(lastMatchPath, JSON.stringify({
    tool: top.capability.name,
    score: top.score,
    historyBoost: top.historyBoost ?? 0,
    updatedAt: Date.now(),
  }));
} catch {}
```

无匹配时：
```typescript
try {
  writeFileSync(join(LAZYBRAIN_DIR, 'last-match.json'), JSON.stringify({ tool: null, score: 0, updatedAt: Date.now() }));
} catch {}
```

## 步骤 2：新建 bin/statusline.ts

```typescript
#!/usr/bin/env node
/**
 * LazyBrain statusline — reads last-match.json and renders one line
 * Registered in ~/.claude/settings.json as statusline command
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LAZYBRAIN_DIR } from '../src/constants.js';

const lastMatchPath = join(LAZYBRAIN_DIR, 'last-match.json');

function render() {
  if (!existsSync(lastMatchPath)) {
    process.stdout.write('🧠 LazyBrain 待机中\n');
    return;
  }

  try {
    const data = JSON.parse(readFileSync(lastMatchPath, 'utf-8'));

    // 超过 30 秒的结果不显示（已经是旧的了）
    if (Date.now() - data.updatedAt > 30_000) {
      process.stdout.write('🧠 LazyBrain 待机中\n');
      return;
    }

    if (!data.tool) {
      process.stdout.write('🧠 LazyBrain 无匹配\n');
      return;
    }

    const score = Math.round(data.score * 100);
    const boost = data.historyBoost > 0.01 ? ` ↑${Math.round(data.historyBoost * 100)}%` : '';
    process.stdout.write(`🧠 /${data.tool}  [${score}%]${boost}\n`);
  } catch {
    process.stdout.write('🧠 LazyBrain\n');
  }
}

render();
```

## 步骤 3：tsup 配置加入 statusline 入口

读取 `tsup.config.ts`，在 `entry` 数组里加上 `'bin/statusline.ts'`。

## 步骤 4：注册到 settings.json

读取 `~/.claude/settings.json`，在根层级加入字段：

```json
"statusline": "node /Users/jinjungao/work/lazy_user/dist/bin/statusline.js"
```

保留文件里所有已有内容，只追加这一个字段。

## 步骤 5：build + commit

```bash
./node_modules/.bin/tsup 2>&1 | grep -E "success|error"

# 手动验证 statusline 输出
node dist/bin/statusline.js

git add -A && git commit -m "feat: statusline 集成 — 推荐结果显示在输入框上方"
```
