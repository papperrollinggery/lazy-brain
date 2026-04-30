import type { Capability, CapabilitySideEffect, RawCapability } from '../types.js';

export interface CapabilityConflictDiagnostic {
  group: string;
  winner: string;
  suppressed: string[];
  severity: 'info' | 'warn' | 'block';
  reason: string;
}

type ConflictInput = Pick<RawCapability, 'kind' | 'name' | 'origin' | 'provider' | 'description' | 'filePath' | 'triggers'>;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-+|-+$/g, '');
}

export function inferCapabilityProvider(input: Pick<RawCapability, 'origin' | 'provider'>): string {
  return input.provider?.trim() || input.origin || 'unknown';
}

export function inferCapabilityConflictGroup(input: Pick<RawCapability, 'kind' | 'name' | 'conflictGroup'>): string {
  if (input.conflictGroup?.trim()) return input.conflictGroup.trim();
  return `${input.kind}:${normalize(input.name) || 'unnamed'}`;
}

export function inferCapabilitySideEffects(input: ConflictInput & { sideEffects?: CapabilitySideEffect[] }): CapabilitySideEffect[] {
  if (input.sideEffects?.length) return [...new Set(input.sideEffects)];
  const text = `${input.name} ${input.description} ${input.filePath} ${(input.triggers ?? []).join(' ')}`.toLowerCase();
  const effects = new Set<CapabilitySideEffect>();

  if (/read|scan|search|inspect|review|audit|analy[sz]e|查看|扫描|搜索|审查|检查/.test(text)) effects.add('reads_files');
  if (/write|edit|patch|create|generate|save|update|修改|写入|创建|生成|保存|更新/.test(text)) effects.add('writes_files');
  if (/run|exec|command|shell|terminal|build|test|lint|执行|命令|终端|构建|测试/.test(text)) effects.add('executes_commands');
  if (/api|http|network|browser|web|fetch|download|upload|网络|浏览器|下载|上传/.test(text)) effects.add('network');
  if (/config|settings|hook|statusline|mcp|配置|设置|钩子/.test(text)) effects.add('changes_config');
  if (/hook|statusline|userpromptsubmit|sessionstart|stop|钩子/.test(text)) effects.add('installs_hooks');
  if (/publish|release|deploy|npm|pypi|production|prod|发布|部署|生产/.test(text)) effects.add('publishes');
  if (/delete|remove|reset|force|destructive|rollback|删除|重置|强制|回滚/.test(text)) effects.add('destructive');

  return effects.size > 0 ? [...effects] : ['unknown'];
}

function winnerFor(items: Capability[]): Capability {
  return [...items].sort((a, b) => {
    const priorityA = a.sourcePriority ?? 100;
    const priorityB = b.sourcePriority ?? 100;
    if (priorityA !== priorityB) return priorityA - priorityB;
    if (a.status !== b.status) return a.status === 'installed' ? -1 : 1;
    return a.name.localeCompare(b.name);
  })[0];
}

export function detectCapabilityConflicts(capabilities: Capability[]): CapabilityConflictDiagnostic[] {
  const groups = new Map<string, Capability[]>();

  for (const capability of capabilities) {
    const group = capability.conflictGroup || `${capability.kind}:${normalize(capability.name) || capability.id}`;
    const items = groups.get(group) ?? [];
    items.push(capability);
    groups.set(group, items);
  }

  const conflicts: CapabilityConflictDiagnostic[] = [];
  for (const [group, items] of groups) {
    if (items.length < 2) continue;
    const providers = new Set(items.map(item => inferCapabilityProvider(item)));
    if (providers.size < 2) continue;
    const winner = winnerFor(items);
    conflicts.push({
      group,
      winner: winner.id,
      suppressed: items.filter(item => item.id !== winner.id).map(item => item.id),
      severity: 'warn',
      reason: `Multiple providers expose ${group}; route should rank one winner and keep the rest as alternatives.`,
    });
  }

  return conflicts.sort((a, b) => a.group.localeCompare(b.group));
}
