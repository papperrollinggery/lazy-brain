# LazyBrain Embedding API 方案 — MiniMax 执行提示词

## 任务背景

LazyBrain 是一个 AI 编码助手的技能路由器，项目路径：`/Users/jinjungao/work/lazy_user`

本地 ONNX embedding 因网络问题放弃，改用硅基流动（SiliconFlow）的 OpenAI 兼容 embedding API。

**你需要修改 4 个文件。**

---

## 步骤 1：修改 `src/types.ts`

在 `UserConfig` 接口中，找到：
```ts
  /** LLM API key */
  compileApiKey?: string;
```

在其后添加：
```ts
  /** Embedding API base URL */
  embeddingApiBase?: string;
  /** Embedding API key */
  embeddingApiKey?: string;
  /** Embedding model name */
  embeddingModel?: string;
```

---

## 步骤 2：修改 `src/constants.ts`

在 `DEFAULT_CONFIG` 对象中，找到：
```ts
  compileModel: 'claude-sonnet-4-6',
```

在其后添加：
```ts
  embeddingApiBase: 'https://api.siliconflow.cn/v1',
  embeddingModel: 'BAAI/bge-m3',
```

---

## 步骤 3：完全替换 `src/indexer/embeddings/provider.ts`

用以下内容完全替换该文件：

```ts
/**
 * LazyBrain — API Embedding Provider
 *
 * OpenAI-compatible embedding API (SiliconFlow, OpenAI, etc.)
 * No local model download required.
 */

import type { EmbeddingProvider } from '../../types.js';

export interface ApiEmbeddingConfig {
  apiBase: string;
  apiKey: string;
  model: string;
}

export class ApiEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;
  private config: ApiEmbeddingConfig;

  constructor(config: ApiEmbeddingConfig, dimensions = 1024) {
    this.config = config;
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.config.apiBase}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        input: texts,
        encoding_format: 'float',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Embedding API error ${res.status}: ${text}`);
    }

    const data = await res.json() as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    return data.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding);
  }
}

export function createEmbeddingProvider(config: ApiEmbeddingConfig): EmbeddingProvider {
  return new ApiEmbeddingProvider(config);
}
```

---

## 步骤 4：修改 `src/matcher/matcher.ts`

### 4a. 检查 `MatchOptions` 接口是否有 `embeddingProvider` 字段

找到 `MatchOptions` 接口定义，确认有以下字段（如果没有则添加）：
```ts
  embeddingProvider?: EmbeddingProvider;
```

同时确认顶部有 import：
```ts
import type { ..., EmbeddingProvider } from '../types.js';
```

### 4b. 更新 Layer 2 的实现

找到 Layer 2 的代码块（包含 `createLocalEmbeddingProvider` 的部分），替换为：

```ts
  // ─── Layer 2: Embedding fallback (if enabled and tag results weak) ────
  if (config.engine === 'embedding' || config.engine === 'hybrid') {
    if (results.length === 0 || results[0].score < 0.5) {
      const provider = options.embeddingProvider;
      if (provider) {
        const embeddingResults = await semanticMatch(query, allNodes, provider, platform, MAX_RESULTS);
        results = mergeResults(results, embeddingResults);
      }
    }
  }
```

### 4c. 删除不再需要的 import

如果文件顶部有 `import { createLocalEmbeddingProvider }` 这行，删掉它。

---

## 步骤 5：修改 `bin/lazybrain.ts`

### 5a. 更新 import

找到：
```ts
import { createEmbeddingProvider } from '../src/indexer/embeddings/provider.js';
```

替换为：
```ts
import { createEmbeddingProvider, type ApiEmbeddingConfig } from '../src/indexer/embeddings/provider.js';
```

### 5b. 更新 `cmdCompile` 中的 embedding 生成

找到：
```ts
      const provider = createEmbeddingProvider();
```

替换为：
```ts
      if (!config.embeddingApiKey) {
        console.error('  Embedding API key not set. Run: lazybrain config set embeddingApiKey <key>');
        process.exit(1);
      }
      const embeddingConfig: ApiEmbeddingConfig = {
        apiBase: config.embeddingApiBase ?? 'https://api.siliconflow.cn/v1',
        apiKey: config.embeddingApiKey,
        model: config.embeddingModel ?? 'BAAI/bge-m3',
      };
      const provider = createEmbeddingProvider(embeddingConfig);
```

### 5c. 更新 `cmdMatch` 中的 embedding provider 创建

找到：
```ts
  const embeddingProvider = (config.engine === 'embedding' || config.engine === 'hybrid')
    ? createEmbeddingProvider()
    : undefined;
```

替换为：
```ts
  const embeddingProvider = (config.engine === 'embedding' || config.engine === 'hybrid') && config.embeddingApiKey
    ? createEmbeddingProvider({
        apiBase: config.embeddingApiBase ?? 'https://api.siliconflow.cn/v1',
        apiKey: config.embeddingApiKey,
        model: config.embeddingModel ?? 'BAAI/bge-m3',
      })
    : undefined;
```

---

## 验证

```bash
cd /Users/jinjungao/work/lazy_user

# 构建，确认零 TS 错误
npm run build

# 跑测试
npm run test
```

**不要**在代码里写入任何 API key。验证只需构建和测试通过即可。
