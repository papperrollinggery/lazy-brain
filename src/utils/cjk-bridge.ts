/**
 * LazyBrain — CJK-English Keyword Bridge
 *
 * Maps common Chinese programming terms to English equivalents.
 * Used in offline mode to enable basic cross-language matching.
 * LLM compilation mode generates richer bilingual tags automatically.
 */

const ZH_EN_MAP: Record<string, string[]> = {
  // Code quality
  '审查': ['review', 'audit'],
  '代码': ['code'],
  '重构': ['refactor'],
  '质量': ['quality'],
  '清理': ['clean', 'cleanup'],
  '格式': ['format', 'lint'],

  // Testing
  '测试': ['test', 'testing'],
  '单元': ['unit'],
  '集成': ['integration'],
  '覆盖': ['coverage'],
  '断言': ['assert'],

  // Development
  '开发': ['development', 'develop'],
  '前端': ['frontend', 'front-end', 'ui'],
  '后端': ['backend', 'back-end', 'server'],
  '组件': ['component'],
  '页面': ['page', 'landing'],
  '接口': ['api', 'interface'],
  '函数': ['function'],
  '模块': ['module'],

  // Deployment
  '部署': ['deploy', 'deployment'],
  '发布': ['release', 'publish'],
  '构建': ['build'],
  '提交': ['commit'],
  '合并': ['merge'],
  '分支': ['branch'],

  // Design
  '设计': ['design'],
  '界面': ['ui', 'interface'],
  '样式': ['style', 'css'],
  '布局': ['layout'],
  '动画': ['animation'],

  // Planning
  '规划': ['plan', 'planning'],
  '架构': ['architecture', 'architect'],
  '需求': ['requirement', 'prd'],
  '文档': ['document', 'docs'],

  // Research
  '研究': ['research'],
  '分析': ['analysis', 'analyze'],
  '搜索': ['search'],
  '探索': ['explore'],

  // Operations
  '运维': ['devops', 'operations'],
  '监控': ['monitor', 'monitoring'],
  '日志': ['log', 'logging'],

  // Security
  '安全': ['security', 'secure'],
  '漏洞': ['vulnerability'],
  '加密': ['encrypt'],
  '认证': ['auth', 'authentication'],

  // Content
  '写作': ['write', 'writing'],
  '文章': ['article', 'blog'],
  '内容': ['content'],

  // Data
  '数据': ['data', 'database'],
  '迁移': ['migration', 'migrate'],
  '查询': ['query'],

  // Orchestration
  '工作流': ['workflow'],
  '编排': ['orchestrate', 'orchestration'],
  '团队': ['team'],
  '代理': ['agent'],

  // Learning
  '学习': ['learn', 'learning'],
  '进化': ['evolve', 'evolution'],
  '优化': ['optimize', 'optimization'],

  // Communication
  '通知': ['notification', 'notify'],
  '消息': ['message'],

  // Common verbs (only domain-specific ones, skip generic like 帮/做)
  '创建': ['create', 'new'],
  '修复': ['fix', 'repair'],
  '删除': ['delete', 'remove'],
  '更新': ['update'],
  '生成': ['generate'],
  '检查': ['check', 'inspect'],
  '调试': ['debug'],
  '运行': ['run', 'execute'],
  '配置': ['config', 'configure'],
  '写': ['write'],
};

// Reverse map: English → Chinese
const EN_ZH_MAP: Record<string, string[]> = {};
for (const [zh, enList] of Object.entries(ZH_EN_MAP)) {
  for (const en of enList) {
    if (!EN_ZH_MAP[en]) EN_ZH_MAP[en] = [];
    EN_ZH_MAP[en].push(zh);
  }
}

/**
 * Expand a list of tokens with cross-language equivalents.
 * Returns { original: string[], expanded: string[] } where expanded
 * contains only the NEW tokens added by the bridge (not in original).
 */
export function expandTokens(tokens: string[]): { original: string[]; expanded: string[] } {
  const originalSet = new Set(tokens);
  const expandedSet = new Set<string>();

  for (const token of tokens) {
    // Chinese → English
    if (ZH_EN_MAP[token]) {
      for (const en of ZH_EN_MAP[token]) {
        if (!originalSet.has(en)) expandedSet.add(en);
      }
    }

    // Try matching CJK substrings
    for (const [zh, enList] of Object.entries(ZH_EN_MAP)) {
      if (token.includes(zh) || zh.includes(token)) {
        for (const en of enList) {
          if (!originalSet.has(en)) expandedSet.add(en);
        }
      }
    }

    // English → Chinese
    const lower = token.toLowerCase();
    if (EN_ZH_MAP[lower]) {
      for (const zh of EN_ZH_MAP[lower]) {
        if (!originalSet.has(zh)) expandedSet.add(zh);
      }
    }
  }

  return { original: tokens, expanded: [...expandedSet] };
}
