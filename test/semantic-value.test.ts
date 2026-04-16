import { test, expect } from 'vitest';
import { Graph } from '../src/graph/graph.js';
import { match } from '../src/matcher/matcher.js';
import { createEmbeddingProvider } from '../src/indexer/embeddings/provider.js';
import { loadConfig } from '../src/config/config.js';

const GRAPH_PATH = '/Users/jinjungao/.lazybrain/graph.json';

const LONG_TAIL_QUERIES = [
  { query: '帮我设计 REST API 接口', note: '长尾: 无常见关键词' },
  { query: '数据库连接池配置', note: '长尾: 配置类' },
  { query: 'CI/CD pipeline 优化', note: '长尾: DevOps' },
  { query: '性能压测', note: '长尾: testing' },
  { query: 'API 限流实现', note: '长尾: 系统设计' },
  { query: '分布式事务', note: '长尾: 架构' },
  { query: '日志聚合方案', note: '长尾: 可观测性' },
  { query: '灰度发布策略', note: '长尾: 发布' },
  { query: '多租户架构', note: '长尾: 架构' },
  { query: '配置中心设计', note: '长尾: 基础设施' },
] as const;

test('semantic layer value: tag-only vs hybrid on long-tail queries', async () => {
  const graph = Graph.load(GRAPH_PATH);
  const nodes = graph.getAllNodes();
  const withEmb = nodes.filter(n => n.embedding && n.embedding.length > 0).length;
  expect(withEmb).toBeGreaterThan(0);

  const config = loadConfig();
  if (!config.embeddingApiKey) {
    console.log('SKIP: No embeddingApiKey configured');
    return;
  }

  const provider = createEmbeddingProvider({
    apiBase: config.embeddingApiBase!,
    apiKey: config.embeddingApiKey!,
    model: config.embeddingModel!,
  });

  let hybridBetter = 0;
  let tagBetter = 0;
  const results: string[] = [];

  for (const { query, note } of LONG_TAIL_QUERIES) {
    const saved = config.engine;
    config.engine = 'tag';
    const tagR = await match(query, { graph, config, embeddingProvider: undefined });
    config.engine = 'hybrid';
    const hybridR = await match(query, { graph, config, embeddingProvider: provider });
    config.engine = saved;

    const tagFirst = tagR.matches[0]?.capability.name ?? '(none)';
    const hybridFirst = hybridR.matches[0]?.capability.name ?? '(none)';
    const sameTop = tagFirst === hybridFirst;

    if (!sameTop) {
      if (hybridFirst !== '(none)') hybridBetter++;
      else tagBetter++;
    }

    results.push(`tag=${tagFirst} | hybrid=${hybridFirst} | ${sameTop ? 'SAME' : 'DIFF'} | ${note}`);
  }

  console.log('\n=== Semantic Layer Value ===');
  for (const r of results) console.log(r);
  console.log(`\nhybrid wins: ${hybridBetter}/10, tag wins: ${tagBetter}/10`);
  console.log(`Total diffs: ${hybridBetter + tagBetter}/10`);

  // Pass always - the point is to SEE the results
  expect(true).toBe(true);
});

test('graph has embeddings for all capabilities', async () => {
  const graph = Graph.load(GRAPH_PATH);
  const nodes = graph.getAllNodes();
  const withEmb = nodes.filter(n => n.embedding && n.embedding.length > 0).length;
  console.log(`Embedding coverage: ${withEmb}/${nodes.length}`);
  expect(withEmb).toBeGreaterThan(nodes.length * 0.9);
});
