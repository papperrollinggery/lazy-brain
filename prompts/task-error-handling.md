# Task: 错误处理加固

## 背景

`lazybrain compile` 和 `lazybrain embed` 目前有几个错误处理漏洞，会导致用户看不到有用的错误信息或数据丢失。

## 问题清单

### 1. LLM key 失效时静默跑完（最高优先级）

**现象：** API key 过期或余额不足时，每个 capability 都会失败，但被 `Promise.allSettled` 吞掉，最后只显示 `491 errors`，用户不知道是 key 问题。

**修法：** 在 Phase 1 第一个 batch 完成后检查失败率，如果全部失败则立刻中断并打印具体错误：

```typescript
// 第一个 batch 跑完后
const firstBatchFailed = results.filter(r => r.status === 'rejected').length;
if (firstBatchFailed === batch.length && batch.length > 0) {
  const firstError = (results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason;
  console.error(`\nLLM API error (all ${batch.length} requests failed): ${firstError?.message ?? firstError}`);
  console.error('Check: compileApiBase, compileApiKey, compileModel in ~/.lazybrain/config.json');
  process.exit(1);
}
```

位置：`src/compiler/compiler.ts` Phase 1 循环内，第一个 batch 之后。

### 2. Ctrl+C 时 graph.json 不保存

**现象：** compile 跑到一半被中断，已编译的节点全部丢失，下次必须 `--force` 重跑。

**修法：** 在 `bin/lazybrain.ts` compile 命令里注册 SIGINT handler，在退出前保存当前 graph：

```typescript
const sigintHandler = () => {
  graph.save(GRAPH_PATH);
  console.log(`\n\nInterrupted. Saved ${graph.getAllNodes().length} nodes to ${GRAPH_PATH}`);
  console.log('Run without --force to resume from checkpoint.');
  process.exit(0);
};
process.on('SIGINT', sigintHandler);
// compile 完成后移除
process.removeListener('SIGINT', sigintHandler);
```

注意：`graph` 对象是 `compile()` 返回的，需要在 compile 开始前就能访问。可以把 `existingGraph` 传进去，compile 过程中直接修改它，SIGINT 时保存这个引用。

实际上 `compile()` 已经接受 `existingGraph` 参数并在内部修改它，所以直接在外部持有引用即可：

```typescript
const liveGraph = (existsSync(GRAPH_PATH) && !args.includes('--force'))
  ? Graph.load(GRAPH_PATH)
  : new Graph();

process.on('SIGINT', () => {
  liveGraph.save(GRAPH_PATH);
  console.log(`\nInterrupted. Saved ${liveGraph.getAllNodes().length} nodes.`);
  process.exit(0);
});

const result = await compile(rawCapabilities, { ..., existingGraph: liveGraph });
```

位置：`bin/lazybrain.ts` compile 命令的 LLM 分支。

### 3. Embedding batch 无 try/catch

**现象：** `provider.embedBatch()` 报错直接 crash，已生成的 embedding 丢失。

**修法：** 包一层 try/catch，失败时打印错误并保存已有进度：

```typescript
try {
  const embeddings = await provider.embedBatch(texts);
  // ... 写入 node.embedding
} catch (err) {
  graphToEmbed.save(GRAPH_PATH);
  console.error(`\nEmbedding API error at batch ${i}-${i+BATCH_SIZE}: ${err instanceof Error ? err.message : err}`);
  console.error('Progress saved. Re-run to continue from checkpoint.');
  process.exit(1);
}
```

位置：`bin/lazybrain.ts` embedding 生成循环内。

### 4. Phase 2 失败不计入 errors

**现象：** relation inference 的 rejected Promise 被静默跳过，汇总里看不到。

**修法：** 在 `src/compiler/compiler.ts` Phase 2 循环里，rejected 时 push 到 errors：

```typescript
if (result.status === 'rejected') {
  errors.push(`relation:${batch[results.indexOf(result)]?.name ?? '?'}: ${result.reason?.message ?? result.reason}`);
}
```

## 关键文件

- `src/compiler/compiler.ts` — Phase 1 首批失败检测、Phase 2 错误计入
- `bin/lazybrain.ts` — SIGINT handler、embedding try/catch

## 验证

```bash
npm run build

# 测试 1: 用错误的 key
lazybrain config set compileApiKey bad-key
lazybrain compile --force
# 预期: 第一批失败后立刻报错退出，不是跑完 491 个

# 测试 2: Ctrl+C 中断
lazybrain compile --force
# 跑几秒后 Ctrl+C
# 预期: 打印 "Saved N nodes"，再次运行不加 --force 能从断点继续

# 恢复正确 key
lazybrain config set compileApiKey <real-key>
```
