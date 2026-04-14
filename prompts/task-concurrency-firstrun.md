# Task: 并发安全 + 首次运行体验

## 背景

两个问题：
1. 多个 Claude Code 窗口同时触发 hook，可能同时读写 graph.json 导致数据损坏
2. 用户装完 hook 没 compile 就用，hook 静默返回空结果，用户不知道发生了什么

## 修改文件

### 1. `src/graph/graph.ts` — 文件锁

在 `save()` 方法里加文件锁。用 `proper-lockfile` npm 包或者简单的 `.lock` 文件：

**简单方案（不加依赖）：**

```ts
import { writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';

function withFileLock<T>(lockPath: string, fn: () => T, timeoutMs = 5000): T {
  const lockFile = lockPath + '.lock';
  const start = Date.now();
  
  while (existsSync(lockFile)) {
    if (Date.now() - start > timeoutMs) {
      // Stale lock, force remove
      try { unlinkSync(lockFile); } catch {}
      break;
    }
    // Busy wait (hook is short-lived, acceptable)
    const end = Date.now() + 50;
    while (Date.now() < end) {} // spin
  }
  
  try {
    writeFileSync(lockFile, String(process.pid));
    return fn();
  } finally {
    try { unlinkSync(lockFile); } catch {}
  }
}
```

在 `Graph.save()` 里用：
```ts
save(path: string): void {
  withFileLock(path, () => {
    writeFileSync(path, JSON.stringify(data, null, 2));
  });
}
```

在 `Graph.load()` 里也用锁（防止读到写了一半的文件）：
```ts
static load(path: string): Graph {
  return withFileLock(path, () => {
    const raw = readFileSync(path, 'utf-8');
    // ... parse
  });
}
```

### 2. `bin/hook.ts` — 首次运行检测

在 hook 入口处，graph.json 不存在时给用户提示：

```ts
if (!existsSync(GRAPH_PATH)) {
  // 输出到 stderr（不影响 hook 的 stdout 协议）
  process.stderr.write(
    '[LazyBrain] No knowledge graph found. Run `lazybrain scan && lazybrain compile --offline` to get started.\n'
  );
  process.exit(0);
}
```

**注意：** 需要确认 Claude Code hook 协议——stderr 输出是否会显示给用户。如果不会，改为在 hook 的 JSON 响应里加一个 message 字段。

读 `bin/hook.ts` 确认 hook 的输出格式，然后选择合适的提示方式。

### 3. `bin/lazybrain.ts` — compile 完成后自动提示

compile 完成后，如果 hook 没安装，提示用户：

```ts
// 在 compile 结束后
const settingsPath = join(getClaudeConfigDir(), 'settings.json');
if (existsSync(settingsPath)) {
  const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  const hasHook = settings.hooks?.some?.((h: any) => 
    h.command?.includes('lazybrain') || h.matcher?.includes('lazybrain')
  );
  if (!hasHook) {
    console.log('\n  ⚠ Hook not installed. Run `lazybrain hook install` to enable auto-matching.');
  }
}
```

## 验证

```bash
npm run build

# 1. 测试首次运行（删除 graph.json）
mv ~/.lazybrain/graph.json ~/.lazybrain/graph.json.bak
lazybrain match "test"  # 应该提示 no graph found

# 2. 恢复
mv ~/.lazybrain/graph.json.bak ~/.lazybrain/graph.json

# 3. 测试并发（两个终端同时跑）
# Terminal 1:
lazybrain compile --offline &
# Terminal 2:
lazybrain match "代码审查"
# 不应该崩溃或产生损坏的 JSON
```
