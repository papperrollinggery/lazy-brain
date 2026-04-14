# Task: Compile 错误恢复 — 断点续传 + checkpoint

## 背景

当前 compile 有 SIGINT handler 会保存进度，但：
- 只在 Ctrl+C 时触发，crash/OOM/网络断开不会触发
- Phase 2 没有 checkpoint，中断后从头开始
- 没有自动 checkpoint（每 N 个 node 保存一次）

## 目标

compile 中断后能从断点恢复，不丢失已完成的工作。

## 修改文件

### 1. `src/compiler/compiler.ts` — Phase 1 自动 checkpoint

在 Phase 1 循环里，每处理 20 个 node 自动保存一次：

```ts
const CHECKPOINT_INTERVAL = 20;

// 在 Phase 1 的 for 循环里，每批处理完后：
if (compiled % CHECKPOINT_INTERVAL === 0 && compiled > 0) {
  graph.save(checkpointPath);  // 需要从 options 传入
}
```

### 2. `src/compiler/compiler.ts` — CompileOptions 加 checkpointPath

```ts
export interface CompileOptions {
  // ... 现有字段
  /** Path to save checkpoints during compilation */
  checkpointPath?: string;
}
```

### 3. `src/compiler/compiler.ts` — Phase 2 checkpoint

Phase 2 也加 checkpoint，每处理 20 个 node 保存一次：

```ts
// Phase 2 循环里
if (i % (CHECKPOINT_INTERVAL * concurrency) === 0 && i > 0) {
  graph.save(options.checkpointPath ?? '');
}
```

### 4. `src/compiler/compiler.ts` — Phase 2 跳过已有关系的 node

增量编译时，如果一个 node 已经有关系（从 checkpoint 恢复），跳过它：

```ts
const relationNodes = allNodes.filter(n => {
  if (n.tier !== undefined && n.tier > 1) return false;
  // 跳过已有关系的 node（checkpoint 恢复时）
  if (options.forceRelations) return true;
  const existingLinks = graph.getLinksForNode(n.id);
  return existingLinks.length === 0;
});
```

**注意：** 需要确认 `graph.getLinksForNode()` 方法是否存在。如果不存在，需要在 `Graph` 类里加一个。

### 5. `bin/lazybrain.ts` — 传 checkpointPath

```ts
const result = await compile(rawCapabilities, {
  // ... 现有参数
  checkpointPath: GRAPH_PATH,
});
```

### 6. `bin/lazybrain.ts` — 改进 SIGINT handler

当前 SIGINT handler 只保存 graph。改为也打印恢复命令：

```ts
const sigintHandler = () => {
  liveGraph.save(GRAPH_PATH);
  const nodeCount = liveGraph.getAllNodes().length;
  console.log(`\n\nInterrupted. Saved ${nodeCount} nodes to ${GRAPH_PATH}`);
  console.log('Run `lazybrain compile` (without --force) to resume.');
  process.exit(0);
};
```

## 验证

```bash
npm run build

# 1. 开始编译，中途 Ctrl+C
lazybrain compile --force
# 等 Phase 1 跑到 50% 时 Ctrl+C

# 2. 恢复编译
lazybrain compile
# 应该从断点继续，跳过已编译的 node

# 3. 检查 graph
lazybrain stats
```
