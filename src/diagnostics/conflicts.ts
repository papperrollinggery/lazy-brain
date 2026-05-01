import type { Capability, CapabilitySideEffect, RawCapability } from '../types.js';

export interface CapabilityConflictDiagnostic {
  group: string;
  winner: string;
  suppressed: string[];
  severity: 'info' | 'warn' | 'block';
  reason: string;
  suggestedAction?: string;
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

function normalizedText(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function significantWords(value: string | undefined): Set<string> {
  return new Set(
    normalizedText(value)
      .split(/[^a-z0-9\u4e00-\u9fff]+/)
      .filter(word => word.length >= 4)
  );
}

function descriptionsEquivalent(items: Capability[]): boolean {
  const descriptions = items.map(item => normalizedText(item.description));
  const unique = new Set(descriptions);
  if (unique.size <= 1) return true;

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const left = significantWords(items[i].description);
      const right = significantWords(items[j].description);
      if (left.size === 0 || right.size === 0) return false;
      const intersection = [...left].filter(word => right.has(word)).length;
      const overlap = intersection / Math.min(left.size, right.size);
      if (overlap < 0.65) return false;
    }
  }
  return true;
}

function normalizedName(capability: Capability): string {
  return normalize(capability.name);
}

function sideEffectKey(capability: Capability): string {
  return [...new Set(capability.sideEffects ?? [])].sort().join(',');
}

function hasRiskyRoutingSurface(capability: Capability): boolean {
  if (capability.requiresConfirmation || capability.riskLevel === 'destructive') return true;
  return (capability.sideEffects ?? []).some(effect =>
    effect === 'destructive' ||
    effect === 'publishes' ||
    effect === 'installs_hooks' ||
    effect === 'changes_config'
  );
}

function areEquivalentProviderDuplicates(items: Capability[]): boolean {
  const names = new Set(items.map(normalizedName));
  const sideEffects = new Set(items.map(sideEffectKey));
  return names.size === 1 &&
    descriptionsEquivalent(items) &&
    sideEffects.size === 1 &&
    !items.some(hasRiskyRoutingSurface);
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
    const equivalent = areEquivalentProviderDuplicates(items);
    conflicts.push({
      group,
      winner: winner.id,
      suppressed: items.filter(item => item.id !== winner.id).map(item => item.id),
      severity: equivalent ? 'info' : 'warn',
      reason: equivalent
        ? `Multiple providers expose equivalent ${group}; route will use the winner and keep duplicate providers as alternatives.`
        : `Multiple providers expose ${group}; route should rank one winner and keep the rest as alternatives.`,
      suggestedAction: equivalent
        ? 'No action required. Keep the selected winner and leave equivalent duplicate providers available as alternatives.'
        : 'Choose one primary provider by sourcePriority or explicit conflictGroup metadata before chaining providers with different behavior.',
    });
  }

  return conflicts.sort((a, b) => a.group.localeCompare(b.group));
}
