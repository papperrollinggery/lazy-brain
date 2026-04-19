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
  const accepted = Math.round((stats.totalMatches * stats.hitRate) / 100);
  const rejectedOrUnknown = Math.max(0, stats.totalMatches - accepted);

  lines.push(`## 🧠 LazyBrain · ${formatDate()}`);
  lines.push('');
  lines.push('今天我替你：');
  lines.push(`  ✅ 自动路由 ${stats.totalMatches} 次（接受 ${accepted} / 待确认 ${rejectedOrUnknown}）`);
  lines.push(`  💰 节省估算 ${formatTokens(stats.savedTokens)} tokens / ${formatCost(stats.savedCostUSD)}`);
  lines.push(`  🧰 管理 ${stats.totalCapabilities} 个可用能力`);
  if (stats.duplicatePairs > 0) {
    lines.push(`  🧹 发现 ${stats.duplicatePairs} 对可能重复的工具`);
  }
  lines.push('');

  lines.push('最近我做过的决定：');
  if (stats.recentMatches.length === 0) {
    lines.push('  还没有可展示的推荐。试试问我：“帮我审查这段代码”。');
  } else {
    for (const m of stats.recentMatches) {
      const marker = m.accepted ? '✅' : '❓';
      lines.push(`  ${marker} ${m.timestamp} · “${m.query}” → /${m.matched}`);
    }
  }
  lines.push('');

  lines.push('下一步建议：');
  if (stats.newCapsThisWeek > 0) {
    lines.push(`  - 新增 ${stats.newCapsThisWeek} 个工具，建议运行 \`lazybrain compile\` 更新图谱`);
  } else {
    lines.push('  - 本周暂无新增工具');
  }
  if (stats.duplicatePairs > 0) {
    lines.push('  - 运行 `lazybrain dups` 清理重复能力，推荐会更准');
  } else {
    lines.push('  - 当前没有检测到重复工具');
  }
  lines.push('');

  lines.push('常用命令：`lazybrain stats` · `lazybrain wiki <name>` · `lazybrain summary`');

  return lines.join('\n');
}
