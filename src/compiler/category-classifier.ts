/**
 * LazyBrain — Category Classifier
 *
 * Rule-based category classification using keyword matching.
 */

import type { RawCapability } from '../types.js';

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'code-quality': ['review', 'lint', 'refactor', 'clean', 'quality', 'audit', '审查', '重构'],
  'testing': ['test', 'tdd', 'e2e', 'coverage', 'spec', 'assert', '测试'],
  'development': ['pattern', 'framework', 'frontend', 'backend', 'react', 'vue', 'node', '开发'],
  'deployment': ['deploy', 'ci', 'cd', 'pr', 'git', 'release', 'merge', '部署', '发布'],
  'design': ['design', 'ui', 'ux', 'slide', 'visual', 'css', 'layout', '设计', '界面'],
  'planning': ['plan', 'blueprint', 'prd', 'architecture', 'rfc', 'spec', '规划', '架构'],
  'research': ['search', 'research', 'analysis', 'explore', 'investigate', '研究', '分析'],
  'operations': ['devops', 'monitor', 'infra', 'docker', 'k8s', 'cloud', '运维'],
  'security': ['security', 'scan', 'vulnerability', 'auth', 'encrypt', '安全'],
  'content': ['write', 'article', 'blog', 'video', 'media', 'content', '写作', '内容'],
  'data': ['database', 'migration', 'sql', 'analytics', 'data', '数据'],
  'orchestration': ['agent', 'team', 'workflow', 'mode', 'orchestrat', '编排', '工作流'],
  'learning': ['learn', 'evolve', 'instinct', 'continuous', 'improve', '学习', '进化'],
  'communication': ['email', 'slack', 'notification', 'message', '通知', '消息'],
};

export function classifyCategory(cap: RawCapability): string {
  const text = `${cap.name} ${cap.description}`.toLowerCase();

  const scores: Record<string, number> = {};

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score++;
      }
    }
    if (score > 0) {
      scores[category] = score;
    }
  }

  let bestCategory = 'other';
  let bestScore = 0;

  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}
