# Task: Semantic Layer 接入与验证

## 背景

Semantic layer 代码骨架已存在，但目前 `lazybrain match` 默认走 tag 层，embedding 只在 `compile --with-embeddings` 时生成，且没有验证过端到端流程是否正常工作。

## 当前状态

- `src/matcher/semantic-layer.ts` — cosine 相似度匹配，已实现
- `src/indexer/embeddings/provider.ts` — SiliconFlow API 调用，已实现
- `bin/lazybrain.ts:194` — `compile --with-embeddings` 触发 embedding 生成，已实现
- `bin/lazybrain.ts:368` — match 时如果 `config.engine === 'hybrid'` 则启用 embedding provider
- `src/matcher/matcher.ts` — 需要确认 semantic layer 是否真正被调用

## 目标

让 `lazybrain match` 在 hybrid 模式下真正融合 tag + semantic 结果，并验证中文查询的提升效果。

## 需要做的事

### 1. 验证 matcher.ts 是否调用了 semantic layer

读 `src/matcher/matcher.ts`，确认：
- `embeddingProvider` 传入后是否调用了 `semanticMatch()`
- 是否调用了 `mergeTagAndSemantic()`
- 如果没有，补上调用

### 2. 补一个 `lazybrain embed` 子命令

目前 embedding 生成藏在 `compile --with-embeddings` 里，不直观。加一个独立命令：

```
lazybrain embed              # 为所有没有 embedding 的 capability 生成向量
lazybrain embed --force      # 强制重新生成全部
```

逻辑复用 `bin/lazybrain.ts:199-235` 已有的代码，提取成函数，两个地方都调用。

### 3. 验证端到端

配置好 `embeddingApiKey`（SiliconFlow）后：

```bash
lazybrain embed
lazybrain config set engine hybrid
lazybrain match "帮我审查代码"
lazybrain match "review my code"
lazybrain match "代码质量检查"
```

对比 tag 模式和 hybrid 模式的结果差异，确认 semantic 层有贡献。

## 关键文件

- `src/matcher/matcher.ts` — 主匹配逻辑
- `src/matcher/semantic-layer.ts` — semantic 匹配（`semanticMatch`, `mergeTagAndSemantic`）
- `src/indexer/embeddings/provider.ts` — embedding API
- `bin/lazybrain.ts` — CLI 入口，embed 逻辑在 194-235 行
- `src/types.ts` — `LazyBrainConfig.engine` 字段

## 不需要做

- 本地模型支持
- 向量数据库（embedding 存在 graph.json 的 node.embedding 字段里）
- 批量大小调优

## 验证

```bash
npm run build
lazybrain embed
lazybrain config set engine hybrid
lazybrain match "帮我写单元测试"
# 应该能匹配到 tdd-workflow、e2e-testing 等，且 layer 字段显示 semantic 或 hybrid
```
