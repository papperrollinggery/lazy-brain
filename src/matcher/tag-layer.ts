/**
 * LazyBrain — Tag Layer (Primary Matching Layer)
 *
 * Matches user input against LLM-compiled tags and example queries.
 * This is the main matching engine — fast, zero API cost at query time.
 */

import type { Capability, MatchResult, Platform } from '../types.js';
import { MIN_MATCH_SCORE } from '../constants.js';
import { expandTokens } from '../utils/cjk-bridge.js';
import { enrichQueryForMatching, isIntentExpansionToken, normalizeQuery } from '../utils/query-normalizer.js';

/**
 * English stopwords that carry no domain signal.
 * Filtering these prevents "for", "to", "the" from inflating scores on
 * uncompiled capabilities whose totalWeight is near zero.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'up', 'as', 'is', 'it', 'its', 'be', 'was',
  'are', 'been', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would',
  'can', 'could', 'may', 'might', 'this', 'that', 'these', 'those', 'my',
  'your', 'our', 'their', 'me', 'him', 'her', 'us', 'them', 'i', 'we',
  'you', 'he', 'she', 'they', 'what', 'which', 'who', 'how', 'when',
  'where', 'why', 'all', 'any', 'some', 'no', 'not', 'so', 'if', 'then',
]);

/**
 * Tokenize input into searchable terms.
 * Returns { semantic, bigrams } where:
 *   semantic — meaningful units used as the normalization denominator
 *              (CJK full segments ≥2 chars, Latin words after stopword filter)
 *   bigrams  — CJK 2-char sliding windows used only for bridge key matching
 *
 * Keeping them separate lets scoreCapability normalize by semantic count
 * instead of total token count, preventing CJK bigram explosion from
 * diluting scores on short queries.
 */
export function tokenize(text: string): string[] {
  const lower = enrichQueryForMatching(text).toLowerCase();
  const tokens: string[] = [];

  // Extract CJK segments with sliding window (2-char bigrams + full segment)
  // This allows "帮我审查代码" to match bridge keys like "审查" and "代码"
  const cjk = lower.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]+/g);
  if (cjk) {
    for (const segment of cjk) {
      // Add full segment (for exact tag matches like "代码审查")
      if (segment.length >= 2) tokens.push(segment);
      // Add 2-char bigrams (for bridge key matching like "审查", "代码")
      for (let i = 0; i < segment.length - 1; i++) {
        tokens.push(segment.slice(i, i + 2));
      }
    }
  }

  // Extract Latin words, filtering stopwords
  const words = lower.match(/[a-z0-9][a-z0-9-]*/g);
  if (words) {
    for (const w of words) {
      if (!STOPWORDS.has(w)) tokens.push(w);
    }
  }

  return [...new Set(tokens)];
}

/** Weight multiplier for bridge-expanded tokens vs original tokens */
const BRIDGE_WEIGHT = 0.4;

/**
 * Language/framework keywords that make a capability specialized.
 * When the query lacks these but the capability has them, we apply a penalty.
 */
const LANG_KEYWORDS = new Set([
  'cpp', 'c++', 'c#', 'kotlin', 'python', 'go', 'golang', 'rust',
  'flutter', 'dart', 'swift', 'java', 'ruby', 'php', 'scala',
  'django', 'spring', 'springboot', 'laravel', 'rails', 'react', 'vue',
  'angular', 'svelte', 'nextjs', 'nuxt', 'fastapi', 'flask', 'express',
  'kubernetes', 'docker', 'terraform', 'android', 'ios', 'macos', 'windows',
  'linux', 'webassembly', 'wasm', 'solidity', 'blockchain', 'mcp',
  'postgres', 'mysql', 'mongodb', 'redis', 'clickhouse',
  'gradle', 'maven', 'webpack', 'vite', 'bun', 'deno',
]);

/** Penalty multiplier for language-specialized capabilities on generic queries */
const LANG_SPECIALTY_PENALTY = 0.5;
const SCOPED_MAINTENANCE_PENALTY = 0.25;
const INTENT_CLUSTER_BOOST = 0.35;
const SPECIALIZED_INTENT_BOOST = 0.35;

interface IntentCluster {
  triggers: string[];
  nameHints?: string[];
  tagHints?: string[];
  descHints?: string[];
  categoryHints?: string[];
}

const INTENT_CLUSTERS: IntentCluster[] = [
  {
    triggers: ['architecture', 'architect', 'system-design', 'planner', 'backend-architect'],
    nameHints: ['architect', 'planner'],
    tagHints: ['architecture', 'architect', 'planning', 'plan', 'design'],
    categoryHints: ['planning', 'development'],
  },
  {
    triggers: ['deployment', 'production', 'verification', 'verify', 'release'],
    nameHints: ['verify', 'setup', 'deploy', 'engineer', 'frontend', 'product'],
    tagHints: ['deployment', 'production', 'verification', 'release', 'setup', 'frontend', 'product'],
    descHints: ['deploy', 'production', 'release', 'verify', 'frontend', 'product', 'ai'],
    categoryHints: ['deployment', 'operations'],
  },
  {
    triggers: ['onboarding', 'codebase', 'tour', 'code-tour', 'documentation'],
    nameHints: ['onboarding', 'tour', 'bridge', 'skill-create', 'review'],
    tagHints: ['onboarding', 'code-tour', 'bridge', 'tour', 'review'],
    descHints: ['onboarding', 'codebase', 'guide'],
    categoryHints: ['learning', 'development'],
  },
  {
    triggers: ['database', 'migration', 'migrate', 'database-optimizer'],
    nameHints: ['database', 'migration'],
    tagHints: ['database', 'migration', 'schema'],
    descHints: ['database', 'migration', 'schema'],
    categoryHints: ['data', 'development'],
  },
  {
    triggers: ['technical', 'article', 'writer', 'writing', 'article-writing', 'technical-writer'],
    nameHints: ['writer', 'article'],
    tagHints: ['technical', 'article', 'writing', 'writer'],
    descHints: ['article', 'writer', 'technical', 'blog'],
    categoryHints: ['content', 'communication'],
  },
  {
    triggers: ['typo', 'small-fix', 'minimal-change', 'fix'],
    nameHints: ['minimal', 'build-fix'],
    tagHints: ['minimal', 'fix', 'typo'],
    descHints: ['minimal', 'fix', 'small'],
    categoryHints: ['development', 'code-quality'],
  },
  {
    triggers: ['refactor', 'simplify', 'readability', 'code-simplifier', 'refactor-clean'],
    nameHints: ['simplifier', 'refactor'],
    tagHints: ['simplifier', 'refactor'],
    descHints: ['clarity', 'maintainability', 'refine', 'dead code'],
    categoryHints: ['code-quality', 'development'],
  },
  {
    triggers: ['commit', 'git-commit', 'git-master', 'prp-commit'],
    nameHints: ['commit', 'git'],
    tagHints: ['commit', 'git', 'review'],
    descHints: ['commit', 'git history', 'atomic commits'],
    categoryHints: ['development', 'code-quality'],
  },
  {
    triggers: ['python', 'python-review', 'python-patterns'],
    nameHints: ['python'],
    tagHints: ['python'],
    descHints: ['python'],
    categoryHints: ['development'],
  },
  {
    triggers: ['database', 'query', 'optimize', 'optimizer', 'postgres', 'postgres-patterns', 'prompt-optimize'],
    nameHints: ['database', 'optimizer', 'postgres', 'prompt-optimize'],
    tagHints: ['database', 'optimizer', 'postgres', 'query'],
    descHints: ['query optimization', 'performance tuning', 'database'],
    categoryHints: ['data', 'development'],
  },
  {
    triggers: ['api', 'documentation', 'api-docs', 'technical-writer', 'writer', 'api-design'],
    nameHints: ['api', 'writer', 'technical writer', 'documentation'],
    tagHints: ['api', 'docs', 'writer', 'documentation'],
    descHints: ['api docs', 'documentation', 'technical writer'],
    categoryHints: ['content', 'development'],
  },
  {
    triggers: ['performance', 'optimization', 'benchmark', 'prompt-optimize', 'optimizer'],
    nameHints: ['performance', 'optimizer', 'benchmark'],
    tagHints: ['performance', 'optimizer', 'benchmark'],
    descHints: ['performance', 'optimiz', 'benchmark'],
    categoryHints: ['testing', 'deployment'],
  },
  {
    triggers: ['docker', 'container', 'configure', 'devops', 'devops-automator'],
    nameHints: ['devops', 'configure', 'backend'],
    tagHints: ['docker', 'container', 'configure', 'devops', 'backend'],
    descHints: ['docker', 'container', 'devops', 'backend'],
    categoryHints: ['deployment', 'development'],
  },
  {
    triggers: ['go', 'golang', 'go-build', 'go-review'],
    nameHints: ['go'],
    tagHints: ['go', 'golang'],
    descHints: ['go ', 'golang'],
    categoryHints: ['development', 'code-quality'],
  },
  {
    triggers: ['spring', 'springboot', 'java', 'project-session-manager'],
    nameHints: ['springboot', 'spring'],
    tagHints: ['spring', 'java', 'backend'],
    descHints: ['spring', 'java', 'backend'],
    categoryHints: ['development', 'deployment'],
  },
];

interface SpecializedIntentRule {
  pattern: RegExp;
  nameHints?: string[];
  tagHints?: string[];
  descHints?: string[];
  boost?: number;
}

const SPECIALIZED_INTENT_RULES: SpecializedIntentRule[] = [
  {
    pattern: /(fix.*failing.*tests?|failing.*tests?.*(pr|pull request)|test failure.*(pr|pull request)|修.*测试|测试失败.*(pr|pull request|开|提交)|失败测试.*(pr|pull request|开|提交))/i,
    nameHints: ['ai-regression-testing', 'build-fix', 'github-ops', 'project-session-manager', 'minimal change'],
    descHints: ['failing test', 'failed test', 'pull request', 'pr handoff', 'ci failure', 'minimal'],
    boost: 0.55,
  },
  {
    pattern: /(product direction|product strategy|replan.*product|产品方向|產品方向|重新规划.*产品|重新規劃.*產品|规划.*执行方案|規劃.*執行方案)/i,
    nameHints: ['office-hours', 'plan-ceo-review', 'product-capability', 'ce:plan'],
    tagHints: ['product', 'planning', 'strategy', 'startup'],
    descHints: ['product', 'startup', 'brainstorm', 'worth building', 'design doc'],
    boost: 0.55,
  },
  {
    pattern: /(ai.*slop|slop|ai-generated|ai generated|垃圾代码|垃圾代碼)/i,
    nameHints: ['ai-slop-cleaner'],
    tagHints: ['ai-generated-code', 'slop'],
    descHints: ['ai-generated', 'low-quality'],
    boost: 0.42,
  },
  {
    pattern: /(database.*(migration|migrate)|migrat.*database|数据库.*迁移|資料庫.*遷移|迁移.*数据库|遷移.*資料庫)/i,
    nameHints: ['database optimizer', 'backend-patterns', 'postgres-patterns'],
    descHints: ['database schemas', 'schema design', 'database optimization'],
    boost: 0.95,
  },
  {
    pattern: /(database.*(query|queries|optimi[sz])|optimi[sz].*database|数据库.*(查询|优化)|資料庫.*(查詢|優化)|优化.*数据库|優化.*資料庫)/i,
    nameHints: ['database optimizer', 'postgres-patterns', 'prompt-optimize'],
    descHints: ['query optimization', 'database optimization', 'performance tuning'],
    boost: 0.62,
  },
  {
    pattern: /(codebase.*(onboarding|tour|guide)|onboarding|new developer|新人上手|代码库新人|代碼庫新人|入门|入門)/i,
    nameHints: ['code-tour', 'claude-code-bridge', 'skill-create', 'code-review'],
    tagHints: ['onboarding', 'code-tour', 'codebase', 'tour'],
    descHints: ['onboarding', 'codebase', 'guide'],
    boost: 0.45,
  },
  {
    pattern: /(project planning|project plan|plan project|项目规划|項目規劃|规划项目|規劃項目)/i,
    nameHints: ['omc-plan', 'planner', 'product-capability'],
    tagHints: ['planning', 'plan', 'product'],
    descHints: ['implementation planning', 'product discussions'],
    boost: 0.45,
  },
  {
    pattern: /(code review|review code|审查.*代码|代码.*审查|審查.*代碼|代碼.*審查)/i,
    nameHints: ['code reviewer', 'code-reviewer', 'code-review', 'coding-standards'],
    tagHints: ['code-review', 'review', 'code-quality'],
    descHints: ['code review', 'review code'],
    boost: 0.12,
  },
  {
    pattern: /(pr review|review.*pr|审查.*pr|審查.*pr|pr.*审查|pr.*審查)/i,
    nameHints: ['gitnexus-pr-review', 'review-pr', 'code-review', 'code reviewer'],
    descHints: ['pull request', 'code changes'],
    boost: 0.22,
  },
  {
    pattern: /(system architecture|architecture design|系统架构|系統架構|架构设计|架構設計|设计系统架构)/i,
    nameHints: ['architect', 'software architect', 'backend architect'],
    descHints: ['architecture', 'system design'],
    boost: 0.8,
  },
  {
    pattern: /(api documentation|api docs|generate api documentation|生成.*api.*文档|api.*文档|api.*文件)/i,
    nameHints: ['api-design', 'technical writer', 'writer'],
    descHints: ['api docs', 'documentation', 'technical writer'],
    boost: 0.35,
  },
  {
    pattern: /(deploy to production|production deploy|ship to production)/i,
    nameHints: ['frontend-design', 'product-capability', 'ai engineer'],
    boost: 0.75,
  },
  {
    pattern: /(部署到生产|部署到生產|发布到生产|發佈到生產|上线生产|上線生產)/i,
    nameHints: ['setup', 'verification-loop', 'verify'],
    descHints: ['verify', 'verification'],
    boost: 0.75,
  },
  {
    pattern: /(performance optimization|optimize performance|性能优化|性能優化)/i,
    nameHints: ['prompt-optimize', 'database optimizer', 'backend-patterns'],
    descHints: ['database optimization', 'performance tuning', 'backend architecture'],
    boost: 0.75,
  },
  {
    pattern: /(重构.*后端|重構.*後端|后端.*重构|後端.*重構|refactor.*backend|backend.*refactor)/i,
    nameHints: ['backend-patterns', 'backend architect', 'refactor-clean'],
    descHints: ['backend architecture', 'backend patterns', 'refactor'],
    boost: 0.75,
  },
  {
    pattern: /(写 python 代码|寫 python 代碼|python.*(code|dev|development|开发|開發)|python 开发|python 開發)/i,
    nameHints: ['python-review', 'python-patterns', 'code-review'],
    descHints: ['python code', 'pythonic', 'python'],
    boost: 0.35,
  },
  {
    pattern: /(rust.*(dev|development|开发|開發)|rust 开发|rust 開發)/i,
    nameHints: ['rust-review', 'rust-patterns', 'rust-build'],
    boost: 0.45,
  },
  {
    pattern: /(frontend ui component|frontend component|ui component)/i,
    nameHints: ['frontend-design', 'designer', 'frontend-slides'],
    descHints: ['frontend components', 'web components', 'visual design'],
    boost: 0.35,
  },
  {
    pattern: /(write.*unit tests?|add.*unit tests?|unit tests?|写.*单元测试|寫.*單元測試|写.*单测|寫.*單測|单元测试|單元測試|单测|單測)/i,
    nameHints: ['test-coverage', 'tdd', 'test-engineer', 'tdd-workflow'],
    tagHints: ['coverage', 'tdd', 'test'],
    descHints: ['test coverage', 'missing tests', 'test-driven', 'test strategy'],
    boost: 0.68,
  },
  {
    pattern: /(debug.*(bug|issue|crash|error)|bug.*(debug|crash|error)|crash.*debug|调试.*bug|調試.*bug|排查.*bug|bug.*排查|崩溃.*调试|崩潰.*調試|报错.*排查|報錯.*排查)/i,
    nameHints: ['debugger', 'agent-introspection-debugging', 'build-fix'],
    tagHints: ['debugger', 'debugging', 'debug', 'build'],
    descHints: ['root-cause', 'stack trace', 'regression isolation', 'compilation error'],
    boost: 0.72,
  },
  {
    pattern: /(adversarial.*dual.*review|dual.*review|对抗性.*双.*审查|對抗性.*雙.*審查|双模型.*审查|雙模型.*審查)/i,
    nameHints: ['santa-loop', 'code-reviewer', 'critic'],
    tagHints: ['dual-review', 'review', 'critic'],
    descHints: ['adversarial dual-review', 'independent model reviewers'],
    boost: 0.7,
  },
];

/**
 * Check if a capability is language/framework-specialized.
 * Returns the matching language keyword, or undefined if generic.
 */
function getLangSpecialty(cap: Capability): string | undefined {
  const nameLower = cap.name.toLowerCase();
  const tagsLower = cap.tags.map(t => t.toLowerCase());
  for (const kw of LANG_KEYWORDS) {
    if (nameLower.includes(kw) || tagsLower.some(t => t.includes(kw))) {
      return kw;
    }
  }
  return undefined;
}

/**
 * Check if any query token mentions a language/framework.
 */
function queryHasLangHint(tokens: string[]): boolean {
  for (const t of tokens) {
    if (LANG_KEYWORDS.has(t)) return true;
    // Also check expanded tokens (e.g. "代码" → "code" doesn't help, but "go" from bridge would)
    for (const kw of LANG_KEYWORDS) {
      if (t.includes(kw) && t.length <= kw.length + 3) return true;
    }
  }
  return false;
}

function isScopedMaintenanceCapability(cap: Capability): boolean {
  const haystack = [
    cap.name,
    cap.description,
    ...cap.tags,
    ...cap.exampleQueries,
  ].join(' ').toLowerCase();
  return /claude[.-]?md|claude\.md|project memory/.test(haystack);
}

function queryHasScopedMaintenanceSignal(query: string): boolean {
  return /claude[.-]?md|claude\.md|project memory|项目记忆|專案記憶|项目规则|專案規則/i.test(query);
}

function matchesAnyHint(target: string, hints: string[] | undefined): boolean {
  if (!hints || hints.length === 0) return false;
  return hints.some(hint => target.includes(hint));
}

function computeIntentClusterBoost(tokens: string[], cap: Capability): number {
  if (tokens.length === 0) return 0;

  const tokenSet = new Set(tokens);
  const nameLower = cap.name.toLowerCase();
  const tagLowers = cap.tags.map(t => t.toLowerCase());
  const descLower = cap.description.toLowerCase();
  const categoryLower = cap.category.toLowerCase();

  let boost = 0;

  for (const cluster of INTENT_CLUSTERS) {
    if (!cluster.triggers.some(trigger => tokenSet.has(trigger))) continue;

    const primaryMatch =
      matchesAnyHint(nameLower, cluster.nameHints) ||
      tagLowers.some(tag => matchesAnyHint(tag, cluster.tagHints)) ||
      matchesAnyHint(descLower, cluster.descHints);
    const categoryMatch = matchesAnyHint(categoryLower, cluster.categoryHints);

    // Category 只能作为辅助信号，不能单独触发 boost。
    // 否则 architecture 类 query 会把整个 planning/design 桶整体抬高。
    if (primaryMatch) {
      boost = Math.max(boost, categoryMatch ? INTENT_CLUSTER_BOOST : INTENT_CLUSTER_BOOST * 0.85);
    }
  }

  return boost;
}

function computeSpecializedIntentBoost(query: string, cap: Capability): number {
  const normalized = normalizeQuery(query).toLowerCase();
  const nameLower = cap.name.toLowerCase();
  const tagLowers = cap.tags.map(t => t.toLowerCase());
  const descLower = cap.description.toLowerCase();

  let boost = 0;
  for (const rule of SPECIALIZED_INTENT_RULES) {
    if (!rule.pattern.test(normalized)) continue;
    const matchesRule =
      matchesAnyHint(nameLower, rule.nameHints) ||
      tagLowers.some(tag => matchesAnyHint(tag, rule.tagHints)) ||
      matchesAnyHint(descLower, rule.descHints);
    if (matchesRule) {
      boost = Math.max(boost, rule.boost ?? SPECIALIZED_INTENT_BOOST);
    }
  }
  return boost;
}

/**
 * Check if a token matches a target string.
 */
function tokenMatches(token: string, target: string): boolean {
  if (token.length < 2) return target === token;
  // Require word-boundary match: token must appear as a complete word segment
  // "unit" matches "unit-test", "unit_test", "unit" but NOT "community"
  const idx = target.indexOf(token);
  if (idx === -1) return false;
  const before = idx === 0 || /[^a-z0-9]/.test(target[idx - 1]);
  const after = idx + token.length === target.length || /[^a-z0-9]/.test(target[idx + token.length]);
  return before && after;
}

function nameTokenCoverage(cap: Capability, tokens: string[]): number {
  const nameLower = cap.name.toLowerCase();
  return tokens.filter(token => tokenMatches(token, nameLower)).length;
}

/**
 * Score how well a capability matches the query tokens.
 * Original tokens score at full weight; bridge-expanded tokens at reduced weight.
 */
/**
 * Score a capability against query tokens.
 *
 * Scoring is query-centric: we measure what fraction of query tokens are
 * "covered" by the capability, weighted by signal quality:
 *   - trigger match  → 1.0 (user-defined, highest signal)
 *   - tag match      → 0.8 (compiled, high signal)
 *   - exampleQuery   → 0.6 (compiled, medium signal)
 *   - name match     → 0.4 (structural, lower signal)
 *   - desc match     → 0.2 (noisy, lowest signal)
 *
 * Each query token contributes at most once per signal tier.
 * Bridge-expanded tokens are down-weighted by BRIDGE_WEIGHT.
 *
 * Final score = sum(token_scores) / queryTokenCount, capped at 1.0.
 * This means a 2-token query and a 10-token query are scored on the same
 * scale — capability size no longer inflates or deflates the score.
 */
function scoreCapability(
  original: string[],
  expanded: string[],
  cap: Capability,
  query: string,
): number {
  if (original.length === 0 && expanded.length === 0) return 0;

  // Uncompiled capabilities have no tags or example queries.
  // Without them there is no domain signal — skip entirely.
  if (cap.tags.length === 0 && cap.exampleQueries.length === 0) return 0;

  const allTokens = [...original, ...expanded];
  const isExpanded = new Set(expanded);
  const normalizedQuery = normalizeQuery(query);
  const intentTokens = new Set(
    allTokens.filter(token => isIntentExpansionToken(token, normalizedQuery)),
  );

  // Per-token best score across all signal tiers
  const tokenScore = new Map<string, number>();

  function credit(token: string, weight: number) {
    const w = isExpanded.has(token) ? weight * BRIDGE_WEIGHT : weight;
    const prev = tokenScore.get(token) ?? 0;
    if (w > prev) tokenScore.set(token, w);
  }

  const tagLowers = cap.tags.map(t => t.toLowerCase());
  const nameLower = cap.name.toLowerCase();
  const descLower = cap.description.toLowerCase();

  // Triggers (1.0) — each trigger word must appear as a complete word
  // in the query. This prevents "add" from matching "wiki add" trigger.
  if (cap.triggers) {
    for (const trigger of cap.triggers) {
      const triggerWords = trigger.toLowerCase().split(/\s+/);
      // Count how many trigger words are present in query tokens
      let matchedWords = 0;
      for (const tw of triggerWords) {
        if (tw.length < 2) continue; // Skip single-char trigger words
        for (const token of allTokens) {
          if (token === tw || tokenMatches(tw, token)) {
            matchedWords++;
            break;
          }
        }
      }
      // Only credit if ALL trigger words are present in the query
      if (matchedWords === triggerWords.filter(w => w.length >= 2).length && matchedWords > 0) {
        for (const tw of triggerWords) {
          if (tw.length < 2) continue;
          for (const token of allTokens) {
            if (token === tw || tokenMatches(tw, token)) {
              credit(token, 1.0);
              break;
            }
          }
        }
      }
    }
  }

  // Tags (0.8) — each tag can only be claimed by one token
  const claimedTags = new Set<number>();
  for (const token of allTokens) {
    for (let i = 0; i < tagLowers.length; i++) {
      if (!claimedTags.has(i) && tokenMatches(token, tagLowers[i])) {
        credit(token, 0.8);
        claimedTags.add(i);
        break;
      }
    }
  }

  // Aliases (0.9) — exact match, author-defined triggers
  if (cap.aliases && cap.aliases.length > 0) {
    const aliasLowers = cap.aliases.map(a => a.toLowerCase());
    for (const token of allTokens) {
      if (aliasLowers.includes(token)) {
        credit(token, 0.9);
      }
    }
  }

  // EvolvedTags (0.6) — tokenMatches, user-learned (may have noise)
  if (cap.evolvedTags && cap.evolvedTags.length > 0) {
    const evolvedLowers = cap.evolvedTags.map(t => t.toLowerCase());
    for (const token of allTokens) {
      for (const evolved of evolvedLowers) {
        if (tokenMatches(token, evolved)) {
          credit(token, 0.6);
          break;
        }
      }
    }
  }

  // Example queries (0.6) — best-matching query per token
  if (cap.exampleQueries.length > 0) {
    for (const token of allTokens) {
      for (const query of cap.exampleQueries) {
        if (query.toLowerCase().includes(token)) {
          credit(token, 0.6);
          break;
        }
      }
    }
  }

  // Name (0.4)
  for (const token of allTokens) {
    if (nameLower.includes(token)) credit(token, 0.4);
  }

  // Description (0.2) — only for tokens >= 3 chars to reduce noise
  for (const token of allTokens) {
    if (token.length >= 3 && descLower.includes(token)) credit(token, 0.2);
  }

  if (tokenScore.size === 0) return 0;

  // Normalization denominator:
  // - Latin queries: number of original tokens (each word = 1 unit)
  // - CJK queries: ceil(bigram_count / 2) + latin_word_count
  //   CJK bigrams overlap (sliding window), so 2 bigrams ≈ 1 concept.
  //   "代码审查" → 3 bigrams → ceil(3/2) = 2 concepts (代码, 审查). ✓
  //   "代码库新人上手" → 6 bigrams → ceil(6/2) = 3 concepts. ✓
  //   This is more stable than using expanded.length, which varies with
  //   bridge coverage and can be larger than the actual concept count.
  const hasCJK = original.some(t => /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(t));
  const latinOriginal = original.filter(t => /^[a-z0-9][a-z0-9-]*$/.test(t));
  let queryCount: number;
  if (hasCJK) {
    const bigramCount = original.filter(t =>
      /^[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]{2}$/.test(t)
    ).length;
    queryCount = Math.max(1, Math.ceil(bigramCount / 2) + latinOriginal.length);
  } else {
    queryCount = Math.max(1, original.length);
  }

  if (intentTokens.size > 0) {
    const intentHitCount = [...intentTokens].filter(t => tokenScore.has(t)).length;
    if (intentHitCount > 0) {
      queryCount = Math.min(queryCount, Math.max(1, intentTokens.size));
    }
  }

  const totalScore = [...tokenScore.values()].reduce((a, b) => a + b, 0);
  return Math.min(1, totalScore / queryCount);
}

/**
 * Match user input against all capabilities using tags and example queries.
 */
export function tagMatch(
  query: string,
  capabilities: Capability[],
  platform?: Platform,
  maxResults: number = 5,
): MatchResult[] {
  const rawTokens = tokenize(query);
  const { original, expanded } = expandTokens(rawTokens);
  if (original.length === 0 && expanded.length === 0) return [];

  // Filter by platform compatibility
  const filtered = platform
    ? capabilities.filter(
        c => c.compatibility.includes(platform) || c.compatibility.includes('universal'),
      )
    : capabilities;

  // Score all capabilities
  const hasLangHint = queryHasLangHint([...original, ...expanded]);
  const allTokens = [...original, ...expanded];
  const scored: MatchResult[] = [];
  for (const cap of filtered) {
    let score = scoreCapability(original, expanded, cap, query);
    score += computeIntentClusterBoost(allTokens, cap);
    const specializedBoost = computeSpecializedIntentBoost(query, cap);
    score += specializedBoost;
    if (score < MIN_MATCH_SCORE) continue;

    // Penalize language-specialized capabilities on generic queries
    if (!hasLangHint && specializedBoost === 0 && getLangSpecialty(cap)) {
      score *= LANG_SPECIALTY_PENALTY;
    }

    if (isScopedMaintenanceCapability(cap) && !queryHasScopedMaintenanceSignal(query)) {
      score *= SCOPED_MAINTENANCE_PENALTY;
    }

    score = Math.min(1, score);

    if (score >= MIN_MATCH_SCORE) {
      scored.push({
        capability: cap,
        score,
        layer: 'tag',
        confidence: score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low',
      });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => {
    const scoreDelta = b.score - a.score;
    if (Math.abs(scoreDelta) > 0.001) return scoreDelta;
    const intentDelta = computeSpecializedIntentBoost(query, b.capability) - computeSpecializedIntentBoost(query, a.capability);
    if (intentDelta !== 0) return intentDelta;
    const nameDelta = nameTokenCoverage(b.capability, allTokens) - nameTokenCoverage(a.capability, allTokens);
    if (nameDelta !== 0) return nameDelta;
    return a.capability.name.localeCompare(b.capability.name);
  });
  return scored.slice(0, maxResults);
}
