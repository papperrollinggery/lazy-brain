/**
 * LazyBrain — Session Dashboard Module
 *
 * Formats SessionStats into a markdown dashboard for SessionStart hook injection.
 */

import type { SessionStats } from './session-stats.js';

function formatDate(): string {
  return new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\//g, '-');
}

function formatTokens(n: number): string {
  if (n >= 1000) {
    return `~${(n / 1000).toFixed(0)}k`;
  }
  return String(n);
}

function formatCost(costUSD: number): string {
  if (costUSD >= 1) {
    return `~$${costUSD.toFixed(1)}`;
  }
  return `~$${costUSD.toFixed(2)}`;
}

export function formatDashboard(stats: SessionStats): string {
  const lines: string[] = [];

  lines.push(`## 🧠 LazyBrain 武器库管家 · ${formatDate()}`);
  lines.push('');
  lines.push('### 📊 你的工具使用');
  lines.push('| 总能力 | 已匹配 | 推荐命中率 | 累计省 tokens |');
  lines.push('|--------|--------|-----------|--------------|');
  lines.push(`| ${stats.totalCapabilities}    | ${stats.totalMatches} 次 | ${stats.hitRate}%       | ${formatTokens(stats.savedTokens)} (${formatCost(stats.savedCostUSD)})|`);
  lines.push('');

  lines.push('### 🎯 最近推荐（Top 3）');
  lines.push('| 时间 | 你问的 | 推荐工具 | 接受 |');
  lines.push('|------|--------|---------|:---:|');
  if (stats.recentMatches.length === 0) {
    lines.push('| — | — | — | ❓ |');
  } else {
    for (const m of stats.recentMatches) {
      const accepted = m.accepted ? '✅' : '❓';
      lines.push(`| ${m.timestamp} | ${m.query} | ${m.matched} | ${accepted} |`);
    }
  }
  lines.push('');

  lines.push('### 🔔 新发现');
  if (stats.newCapsThisWeek > 0) {
    lines.push(`- 新增 ${stats.newCapsThisWeek} 个工具`);
  } else {
    lines.push('- 本周暂无新增工具');
  }
  if (stats.duplicatePairs > 0) {
    lines.push(`- 检测到 ${stats.duplicatePairs} 对重复工具（运行 \`lazybrain dups\`）`);
  } else {
    lines.push('- 未检测到重复工具');
  }
  lines.push('');

  lines.push('### 💡 命令');
  lines.push('- `lazybrain stats` 查看完整统计');
  lines.push('- `lazybrain wiki <name>` 查工具详情');
  lines.push('- 在对话里说"推荐 xxx"自动匹配');

  return lines.join('\n');
}
