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

export function formatDashboard(stats: SessionStats): string {
  const lines: string[] = [];
  const topLine = stats.topCapabilities.length > 0
    ? stats.topCapabilities.map((name) => `/${name}`).join(' · ')
    : '还没有稳定的使用偏好 / No stable preference yet';
  const decisionLine = stats.recentMatches.length > 0
    ? stats.recentMatches
      .map((m) => `${m.accepted ? '✅' : '❓'} ${m.timestamp} /${m.matched}`)
      .join(' ｜ ')
    : '还没有可展示的推荐 / No recent routing history';

  lines.push(`## 🧠 LazyBrain · ${formatDate()}`);
  lines.push('');
  lines.push('启动摘要 / Startup recap');
  lines.push(`- 路由记录：${stats.totalRecommendations} 次（注入 ${stats.acceptedRecommendations} / 跳过 ${stats.skippedRecommendations}）`);
  lines.push(`- 注入率：${stats.adoptionRate}%`);
  lines.push(`- 当前能力库：${stats.totalCapabilities} 个`);
  lines.push('- 生命周期：UserPromptSubmit + SessionStart（不参与 Stop）');
  if (stats.lastRecommendedTool) {
    lines.push(`- 最近一次主要推荐：/${stats.lastRecommendedTool}`);
  }
  if (stats.duplicatePairs > 0) {
    lines.push(`- 重复能力提示：${stats.duplicatePairs} 对`);
  }
  lines.push('');
  lines.push('最近决策 / Recent decisions');
  lines.push(`- ${decisionLine}`);
  lines.push('');
  lines.push('常用能力 / Top capabilities');
  lines.push(`- ${topLine}`);
  lines.push('');
  lines.push('建议动作 / Suggested next step');
  if (stats.newCapsThisWeek > 0) {
    lines.push(`- 新增 ${stats.newCapsThisWeek} 个工具，建议运行 \`lazybrain compile\` 更新图谱`);
  } else {
    lines.push('- 当前不依赖 Stop hook，避免与记忆/通知插件竞争收尾生命周期');
  }
  if (stats.duplicatePairs > 0) {
    lines.push('- 运行 `lazybrain dups` 清理重复能力，推荐会更准');
  } else {
    lines.push('- 当前没有检测到重复工具');
  }
  lines.push('');
  lines.push('常用命令 / Useful commands');
  lines.push('- `lazybrain stats` · `lazybrain wiki` · `lazybrain summary` · `lazybrain hook status`');

  return lines.join('\n');
}
