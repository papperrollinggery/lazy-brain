# LazyBrain Semantic Layer — MiniMax 执行提示词

你是一个精确的代码执行者。按以下步骤为 LazyBrain 项目添加 embedding 语义匹配层。

项目路径：`/Users/jinjungao/work/lazy_user`

---

## 步骤 1：安装依赖

```bash
cd /Users/jinjungao/work/lazy_user
npm install @xenova/transformers
```

---

## 步骤 2：新建 `src/indexer/embeddings/provider.ts`

创建文件，内容如下：

```ts
/**
 * LazyBrain — Local Embedding Provider
 *
 * Wraps @xenova/transformers (ONNX runtime) with all-MiniLM-L6-v2.
 * Dynamic import to avoid loading ONNX for non-embedding commands.
 * Model (~23MB) cached to ~/.lazybrain/models on first use.
 */

import type { EmbeddingProvider } from '../../types.js';
import { MODELS_DIR } from '../../constants.js';

let cachedPipeline: any = null;

async function getExtractor() {
  if (cachedPipeline) return cachedPipeline;
  const { pipeline, env } = await import('@xenova/transformers');
  env.cacheDir = MODELS_DIR;
  cachedPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  return cachedPipeline;
}

export async function createLocalEmbeddingProvider(): Promise<EmbeddingProvider> {
  const extractor = await getExtractor();

  return {
    dimensions: 384,

    async embed(text: string): Promise<number[]> {
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      return output.tolist()[0];
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      const output = await extractor(texts, { pooling: 'mean', normalize: true });
      return output.tolist();
    },
  };
}
```

---

## 步骤 3：新建 `src/matcher/semantic-layer.ts`

创建文件，内容如下：

```ts
/**
 * LazyBrain — Semantic Layer (Embedding Fallback)
 *
 * Cosine similarity matching on pre-computed capability embeddings.
 * Fires when tag layer confidence < 0.5.
 */

import type { Capability, MatchResult, Platform, EmbeddingProvider } from '../types.js';
import { MIN_MATCH_SCORE } from '../constants.js';

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function semanticMatch(
  query: string,
  capabilities: Capability[],
  provider: EmbeddingProvider,
  platform?: Platform,
  maxResults: number = 5,
): Promise<MatchResult[]> {
  let filtered = capabilities.filter(c => c.embedding && c.embedding.length > 0);

  if (platform) {
    filtered = filtered.filter(
      c => c.compatibility.includes(platform) || c.compatibility.includes('universal'),
    );
  }

  if (filtered.length === 0) return [];

  const queryVec = await provider.embed(query);

  const scored: MatchResult[] = [];
  for (const cap of filtered) {
    const score = cosineSimilarity(queryVec, cap.embedding!);
    if (score >= MIN_MATCH_SCORE) {
      scored.push({
        capability: cap,
        score,
        layer: 'semantic',
        confidence: score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low',
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}
```

---

## 步骤 4：修改 `src/matcher/matcher.ts`

### 4a. 在文件顶部 import 区域添加两行：

在 `import { tagMatch } from './tag-layer.js';` 之后添加：

```ts
import { semanticMatch } from './semantic-layer.js';
import { createLocalEmbeddingProvider } from '../indexer/embeddings/provider.js';
```

### 4b. 把 `match` 函数签名改为 async：

找到：
```ts
export function match(query: string, options: MatchOptions): Recommendation {
```

替换为：
```ts
export async function match(query: string, options: MatchOptions): Promise<Recommendation> {
```

### 4c. 替换 Layer 2 的 TODO 注释块：

找到这段注释（约第 53-60 行）：
```ts
  // ─── Layer 2: Embedding fallback (if enabled and tag results weak) ────
  // TODO: implement when embedding module is added
  // if (config.engine === 'embedding' || config.engine === 'hybrid') {
  //   if (results.length === 0 || results[0].score < 0.5) {
  //     const embeddingResults = semanticMatch(query, allNodes, platform);
  //     results = mergeResults(results, embeddingResults);
  //   }
  // }
```

替换为：
```ts
  // ─── Layer 2: Embedding fallback (if enabled and tag results weak) ────
  if (config.engine === 'embedding' || config.engine === 'hybrid') {
    if (results.length === 0 || results[0].score < 0.5) {
      const provider = await createLocalEmbeddingProvider();
      const embeddingResults = await semanticMatch(query, allNodes, provider, platform, MAX_RESULTS);
      results = mergeResults(results, embeddingResults);
    }
  }
```

### 4d. 在文件末尾（最后一个函数之后）添加 mergeResults：

```ts
// ─── Result Merging ──────────────────────────────────────────────────────

function mergeResults(tagResults: MatchResult[], semanticResults: MatchResult[]): MatchResult[] {
  const seen = new Map<string, MatchResult>();

  for (const r of tagResults) {
    seen.set(r.capability.id, r);
  }
  for (const r of semanticResults) {
    const existing = seen.get(r.capability.id);
    if (!existing || r.score > existing.score) {
      seen.set(r.capability.id, r);
    }
  }

  return [...seen.values()].sort((a, b) => b.score - a.score);
}
```

---

## 步骤 5：修改 `bin/lazybrain.ts`

### 5a. 在文件顶部 import 区域添加：

在 `import { loadConfig, saveConfig, updateConfig } from '../src/config/config.js';` 之后添加：

```ts
import { createLocalEmbeddingProvider } from '../src/indexer/embeddings/provider.js';
```

### 5b. 把 `cmdMatch` 改为 async：

找到（约第 304 行）：
```ts
function cmdMatch(implicitQuery?: string) {
```

替换为：
```ts
async function cmdMatch(implicitQuery?: string) {
```

### 5c. 把 match 调用改为 await：

找到（约第 319 行）：
```ts
  const result = match(query, { graph, config });
```

替换为：
```ts
  const result = await match(query, { graph, config });
```

### 5d. 在 match 输出中显示 layer 信息：

找到（约第 331 行）：
```ts
    console.log(`  [${i + 1}] ${m.capability.name} (${pct}%)${origin}`);
```

替换为：
```ts
    console.log(`  [${i + 1}] ${m.capability.name} (${pct}%) [${m.layer}]${origin}`);
```

### 5e. 在 main() 的 switch 中确保 cmdMatch 调用有 await：

找到（约第 51 行）：
```ts
      cmdMatch();
```

替换为：
```ts
      await cmdMatch();
```

找到（约第 83 行）：
```ts
        cmdMatch(cmd);
```

替换为：
```ts
        await cmdMatch(cmd);
```

### 5f. 在 `cmdCompile` 函数末尾添加 embedding 生成阶段：

在 `cmdCompile` 函数的最后一个 `}` 之前（即 offline/LLM 两个分支的 if-else 块之后），插入：

```ts
  // ─── Embedding generation ──────────────────────────────────────────────
  const shouldEmbed = args.includes('--with-embeddings') || config.engine === 'embedding' || config.engine === 'hybrid';

  if (shouldEmbed) {
    const graphToEmbed = Graph.load(GRAPH_PATH);
    const allNodes = graphToEmbed.getAllNodes();
    const needsEmbedding = allNodes.filter(n => !n.embedding || n.embedding.length === 0);

    if (needsEmbedding.length > 0) {
      console.log(`\nGenerating embeddings for ${needsEmbedding.length} capabilities...`);
      const provider = await createLocalEmbeddingProvider();
      const BATCH_SIZE = 32;

      for (let i = 0; i < needsEmbedding.length; i += BATCH_SIZE) {
        const batch = needsEmbedding.slice(i, i + BATCH_SIZE);
        const texts = batch.map(cap =>
          `${cap.name}: ${cap.description}. Tags: ${cap.tags.join(', ')}`
        );
        const embeddings = await provider.embedBatch(texts);

        for (let j = 0; j < batch.length; j++) {
          const node = graphToEmbed.getNode(batch[j].id);
          if (node) {
            node.embedding = embeddings[j];
          }
        }

        process.stdout.write(`\r  [${Math.min(i + BATCH_SIZE, needsEmbedding.length)}/${needsEmbedding.length}]`);
      }

      graphToEmbed.save(GRAPH_PATH);
      console.log(`\n  Embeddings saved to ${GRAPH_PATH}`);
    } else {
      console.log('\nAll capabilities already have embeddings.');
    }
  }
```

---

## 验证

完成所有修改后，按顺序执行：

```bash
# 构建
npm run build

# 启用 hybrid 引擎
lazybrain config set engine hybrid

# 编译 + 生成 embedding（首次下载模型约 23MB）
lazybrain compile --offline

# 测试匹配
lazybrain match "帮我做代码审查"
lazybrain match "something vague about testing"

# 验证 tag-only 模式
lazybrain config set engine tag
lazybrain match "code review"

# 跑测试
npm run test
```

---

## 注意事项

- 不要修改 `src/types.ts`，所有类型已定义好
- 不要修改 `src/constants.ts`，`MODELS_DIR` 和 `EMBEDDING_INDEX_PATH` 已存在
- `Graph.getNode()` 返回对象引用，可以直接赋值 `node.embedding = ...`
- `@xenova/transformers` 的 TypeScript 类型可能不完整，provider.ts 中用 `any` 类型是可以的
