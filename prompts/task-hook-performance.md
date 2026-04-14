# Task: Hook 性能优化 — 内存缓存 + mtime 检查

## 背景

`bin/hook.ts` 在每次用户提交 prompt 时执行。当前实现每次都 `readFileSync` + `JSON.parse` 整个 graph.json（11MB），造成 50-100ms 延迟。这是用户体验的致命瓶颈。

## 目标

hook 执行时间从 ~100ms 降到 <10ms（缓存命中时）。

## 修改文件

### 1. `bin/hook.ts` — 加载 graph 的地方

当前代码大概是：
```ts
const graph = Graph.load(GRAPH_PATH);
```

改为使用缓存模块：
```ts
import { loadGraphCached } from '../src/graph/graph-cache.js';
const graph = loadGraphCached(GRAPH_PATH);
```

### 2. 新建 `src/graph/graph-cache.ts`

```ts
/**
 * LazyBrain — Graph Cache
 *
 * Caches parsed graph in memory, only reloads when file mtime changes.
 * Used by hook to avoid 11MB JSON parse on every prompt.
 */

import { statSync } from 'node:fs';
import { Graph } from './graph.js';

let cachedGraph: Graph | null = null;
let cachedMtime: number = 0;

export function loadGraphCached(path: string): Graph | null {
  try {
    const stat = statSync(path);
    const mtime = stat.mtimeMs;

    if (cachedGraph && mtime === cachedMtime) {
      return cachedGraph;
    }

    cachedGraph = Graph.load(path);
    cachedMtime = mtime;
    return cachedGraph;
  } catch {
    return null;
  }
}

export function invalidateCache(): void {
  cachedGraph = null;
  cachedMtime = 0;
}
```

**注意：** hook 是每次 prompt 都 fork 新进程的话，进程间不共享内存，缓存无效。需要先确认 hook 的执行模型：
- 如果是 fork 新进程：缓存无效，需要改用 mmap 或 binary 格式
- 如果是同一进程多次调用：缓存有效

**确认方法：** 读 `bin/hook.ts` 看它是怎么被调用的。如果是 Claude Code 的 `hooks` 配置里直接 `node bin/hook.ts`，那每次都是新进程，缓存方案需要改为：
1. 把 graph 拆成小文件（只加载 metadata，不加载 embeddings）
2. 或者用 SQLite 做本地缓存
3. 或者用 Unix domain socket 做常驻进程

**如果确认是新进程模式，改为方案 B：**

### 方案 B: 拆分 graph.json

把 `src/graph/graph.ts` 的 `save()` 方法改为输出两个文件：
- `graph-meta.json` — nodes（不含 embedding）+ links，约 3MB
- `embeddings.bin` — Float32Array 二进制，约 2MB

hook 只加载 `graph-meta.json`（3MB，解析 ~15ms），embedding 只在需要时懒加载。

修改 `Graph.save()`:
```ts
save(path: string): void {
  const metaPath = path; // graph.json
  const embPath = path.replace('.json', '-embeddings.bin');
  
  // Strip embeddings from nodes for meta file
  const metaNodes = this.nodes.map(n => {
    const { embedding, ...rest } = n;
    return rest;
  });
  
  const data = { version: this.version, compiledAt: this.compiledAt, compileModel: this.compileModel, nodes: metaNodes, links: this.links, categories: this.categories };
  writeFileSync(metaPath, JSON.stringify(data));  // 不要 pretty-print
  
  // Save embeddings as binary
  const embeddings = this.nodes.map(n => n.embedding ?? []);
  // ... 写入 Float32Array
}
```

## 验证

```bash
npm run build

# 测试 hook 执行时间
time lazybrain match "代码审查"

# 确认 graph-meta.json 大小
ls -lh ~/.lazybrain/graph.json
```
