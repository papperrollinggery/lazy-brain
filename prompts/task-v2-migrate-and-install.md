# Task: Graph 迁移 + Hook 安装

## 背景

两件收尾工作：
1. 把现有 graph.json（11MB，含 embedding）迁移到拆分格式（meta + embeddings.bin）
2. 安装 hook，让 LazyBrain 真正在每次 prompt 时生效

**前置条件：** task-v2-hook-secretary.md 已完成（hook 代码已更新）

---

## Part A：Graph 迁移

### 问题

当前 `~/.lazybrain/graph.json` 是旧格式（11MB，embedding 内嵌在每个节点里）。
`graph.ts` 的 `save()` 方法已经实现了拆分输出（meta + embeddings.bin），但需要重新调用 `save()` 才能生效。

### 方案

不重新跑 LLM compile（会浪费 token），而是写一个迁移脚本，读旧 graph，调 `save()` 输出新格式。

### 步骤

新建 `scripts/migrate-graph.ts`：

```typescript
#!/usr/bin/env node
/**
 * 迁移 graph.json 到拆分格式（meta + embeddings.bin）
 * 不重新调用 LLM，只是重新序列化
 */

import { Graph } from '../src/graph/graph.js';
import { GRAPH_PATH } from '../src/constants.js';
import { existsSync, statSync } from 'node:fs';

const path = GRAPH_PATH;

if (!existsSync(path)) {
  console.error(`Graph not found: ${path}`);
  process.exit(1);
}

const before = statSync(path).size;
console.log(`Loading graph from ${path} (${(before / 1024 / 1024).toFixed(1)} MB)...`);

const graph = Graph.load(path);
const nodes = graph.getAllNodes();
const withEmbedding = nodes.filter(n => n.embedding && n.embedding.length > 0);

console.log(`Nodes: ${nodes.length}, with embedding: ${withEmbedding.length}`);
console.log('Saving in split format...');

graph.save(path);

const after = statSync(path).size;
const embPath = path.replace('.json', '.embeddings.bin');
const embSize = existsSync(embPath) ? statSync(embPath).size : 0;

console.log(`Done:`);
console.log(`  graph.json: ${(after / 1024 / 1024).toFixed(1)} MB (was ${(before / 1024 / 1024).toFixed(1)} MB)`);
if (embSize > 0) {
  console.log(`  embeddings.bin: ${(embSize / 1024 / 1024).toFixed(1)} MB`);
}
```

然后在 `package.json` 的 `scripts` 里新增：
```json
"migrate-graph": "node --loader ts-node/esm scripts/migrate-graph.ts"
```

或者直接用 tsup 编译后运行：
```bash
npm run build
node -e "
const { Graph } = await import('./dist/index.js');
const { GRAPH_PATH } = await import('./dist/index.js');
// 直接在 node 里执行迁移
"
```

**更简单的方案**（推荐）：直接在 `bin/lazybrain.ts` 里加一个 `migrate` 子命令：

在 `cmdCompile` 附近新增：

```typescript
async function cmdMigrate() {
  const { existsSync, statSync } = await import('node:fs');
  if (!existsSync(GRAPH_PATH)) {
    console.error('No graph found. Run lazybrain compile first.');
    process.exit(1);
  }
  const before = statSync(GRAPH_PATH).size;
  console.log(`Loading graph (${(before / 1024 / 1024).toFixed(1)} MB)...`);
  const graph = Graph.load(GRAPH_PATH);
  console.log(`Nodes: ${graph.getAllNodes().length}`);
  console.log('Saving in split format...');
  graph.save(GRAPH_PATH);
  const after = statSync(GRAPH_PATH).size;
  console.log(`graph.json: ${(after / 1024 / 1024).toFixed(1)} MB (was ${(before / 1024 / 1024).toFixed(1)} MB)`);
}
```

在 main() 的命令分发里注册：
```typescript
case 'migrate': await cmdMigrate(); break;
```

在 help 文本里新增：
```
lazybrain migrate              Migrate graph.json to split format (meta + embeddings.bin)
```

### 执行迁移

```bash
npm run build
lazybrain migrate
# 预期：graph.json 从 11MB 降到 ~1MB，生成 graph.embeddings.bin ~8MB
```

---

## Part B：安装 Hook

### 步骤

```bash
# 1. 确认 hook 编译正常
npm run build
echo '{"prompt":"帮我审查代码"}' | node dist/bin/hook.js

# 2. 安装 hook
lazybrain hook install

# 3. 确认 hook 已写入 settings.json
cat ~/.claude/settings.json | python3 -m json.tool | grep -A5 "hooks"
```

### 预期的 settings.json hooks 配置

```json
"hooks": {
  "UserPromptSubmit": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "node /Users/xxx/work/lazy_user/dist/bin/hook.js"
        }
      ]
    }
  ]
}
```

### 验证

重启 Claude Code 后，在新 session 里输入：
```
帮我审查代码
```

在 Claude Code 的 hook 日志里应该能看到 LazyBrain 的输出（stderr 会显示在 hook 日志里）。

---

## 注意事项

- `lazybrain migrate` 会用文件锁，不要在 compile 运行时执行
- hook 安装后需要重启 Claude Code 才生效
- 如果 hook 报错，检查 `dist/bin/hook.js` 是否存在（需要先 `npm run build`）
- hook 的 stderr 输出会显示在 Claude Code 的 hook 日志里，可以用来调试
