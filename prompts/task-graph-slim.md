# Task: Graph 瘦身 — 拆分 metadata + embeddings，去掉 pretty-print

## 背景

graph.json 当前 11MB，每次 hook 触发都要解析。主要膨胀来源：
- 491 个 embedding 向量（1024 维 float）占 ~5MB JSON 文本
- pretty-print（2-space indent）增加 ~30% 体积
- 实际 hook 匹配只需要 tags/exampleQueries/category，不需要 embedding

## 目标

hook 加载的文件从 11MB 降到 <3MB。

## 修改文件

### 1. `src/graph/graph.ts` — save() 拆分输出

```ts
save(path: string): void {
  const data = this.toJSON();
  
  // 1. 主文件：不含 embedding，不 pretty-print
  const metaNodes = data.nodes.map(n => {
    const { embedding, ...rest } = n;
    return rest;
  });
  const metaData = { ...data, nodes: metaNodes };
  writeFileSync(path, JSON.stringify(metaData));  // 无缩进
  
  // 2. Embedding 文件：二进制 Float32Array
  const embPath = path.replace('.json', '.embeddings.bin');
  const nodeIds: string[] = [];
  const vectors: number[][] = [];
  for (const node of data.nodes) {
    if (node.embedding && node.embedding.length > 0) {
      nodeIds.push(node.id);
      vectors.push(node.embedding);
    }
  }
  
  if (vectors.length > 0) {
    const dim = vectors[0].length;
    // Header: [nodeCount(uint32), dim(uint32)] + [nodeId index] + [float32 vectors]
    // 简单方案：JSON index + binary vectors
    const indexPath = path.replace('.json', '.embeddings.index.json');
    writeFileSync(indexPath, JSON.stringify(nodeIds));
    
    const buffer = new Float32Array(vectors.length * dim);
    for (let i = 0; i < vectors.length; i++) {
      buffer.set(vectors[i], i * dim);
    }
    writeFileSync(embPath, Buffer.from(buffer.buffer));
  }
}
```

### 2. `src/graph/graph.ts` — load() 支持拆分格式

```ts
static load(path: string): Graph {
  const raw = readFileSync(path, 'utf-8');
  const data = JSON.parse(raw);
  
  // 尝试加载 embedding（如果存在）
  const embPath = path.replace('.json', '.embeddings.bin');
  const indexPath = path.replace('.json', '.embeddings.index.json');
  
  if (existsSync(embPath) && existsSync(indexPath)) {
    const nodeIds: string[] = JSON.parse(readFileSync(indexPath, 'utf-8'));
    const buffer = readFileSync(embPath);
    const floats = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    const dim = floats.length / nodeIds.length;
    
    const embMap = new Map<string, number[]>();
    for (let i = 0; i < nodeIds.length; i++) {
      embMap.set(nodeIds[i], Array.from(floats.slice(i * dim, (i + 1) * dim)));
    }
    
    // Merge embeddings back into nodes
    for (const node of data.nodes) {
      const emb = embMap.get(node.id);
      if (emb) node.embedding = emb;
    }
  }
  
  return Graph.fromJSON(data);
}
```

### 3. `src/graph/graph.ts` — 新增 loadMetaOnly() 给 hook 用

```ts
/** Load graph without embeddings — fast path for hook */
static loadMetaOnly(path: string): Graph {
  const raw = readFileSync(path, 'utf-8');
  const data = JSON.parse(raw);
  return Graph.fromJSON(data);  // 不加载 .embeddings.bin
}
```

### 4. `bin/hook.ts` — 用 loadMetaOnly

```ts
// 改 Graph.load(GRAPH_PATH) 为：
const graph = Graph.loadMetaOnly(GRAPH_PATH);
```

### 5. `bin/lazybrain.ts` — compile 时的 embedding 生成

embedding 生成阶段需要改为写入 `.embeddings.bin` 而不是写入 graph.json 的 node 里。
检查 `cmdCompile` 里 embedding 生成的代码，确保它调用 `graph.save()` 时 embedding 被正确拆分。

## 验证

```bash
npm run build

# 1. 重新编译
lazybrain compile --offline --force

# 2. 检查文件大小
ls -lh ~/.lazybrain/graph.json
ls -lh ~/.lazybrain/graph.embeddings.bin
ls -lh ~/.lazybrain/graph.embeddings.index.json
# 预期：graph.json < 3MB, embeddings.bin ~2MB

# 3. 测试匹配（不需要 embedding）
lazybrain match "代码审查"

# 4. 测试 embedding 匹配（需要加载 embedding）
lazybrain config set engine hybrid
lazybrain match "代码审查"
```
