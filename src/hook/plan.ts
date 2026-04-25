import type { HookInstallScope } from './types.js';
import { isLazyBrainHookCommand } from './settings.js';
import { homedir } from 'node:os';

type HookCommand = {
  type?: string;
  command?: unknown;
  timeout?: unknown;
};

type HookEntry = {
  matcher?: unknown;
  hooks?: HookCommand[];
  command?: unknown;
};

type SettingsObject = Record<string, unknown> & {
  hooks?: Record<string, unknown>;
};

export type HookPlanRisk = 'safe' | 'needs_attention' | 'blocked';
export type StatuslinePlanMode = 'none' | 'skip' | 'combine' | 'replace' | 'lazybrain';

export interface HookPlan {
  risk: HookPlanRisk;
  scope: HookInstallScope;
  settingsPath: string;
  workspaceRoot?: string;
  installStatePath: string;
  lifecycle: {
    UserPromptSubmit: string[];
    Stop: string[];
    SessionStart: string[];
  };
  lazybrain: {
    userPromptSubmit: boolean;
    stop: boolean;
    sessionStart: boolean;
    removeEvents: string[];
    addUserPromptSubmit: boolean;
  };
  thirdParty: {
    commands: string[];
    mixedEntries: number;
  };
  statusline: {
    mode: StatuslinePlanMode;
    existingCommand: string;
    inheritedCommand: string;
    plannedCommand: string;
  };
  warnings: string[];
  blockers: string[];
}

export interface HookPlanOptions {
  scope: HookInstallScope;
  settingsPath: string;
  settings: SettingsObject;
  globalSettings?: SettingsObject;
  workspaceRoot?: string;
  hookCommand: string;
  statuslineScript: string;
  combinedStatuslineScript: string;
  combinedStatuslineCommand: string;
  installStatePath: string;
  shouldInstallStatusline: boolean;
  shouldReplaceStatusline: boolean;
  scriptsReady?: boolean;
}

function normalizeEntries(value: unknown): HookEntry[] {
  return Array.isArray(value) ? value as HookEntry[] : [];
}

function nestedHooks(entry: HookEntry): HookCommand[] {
  return Array.isArray(entry.hooks) ? entry.hooks : [];
}

function flattenCommands(entries: HookEntry[]): string[] {
  const commands: string[] = [];
  for (const entry of entries) {
    if (typeof entry.command === 'string') commands.push(entry.command);
    for (const hook of nestedHooks(entry)) {
      if (typeof hook.command === 'string') commands.push(hook.command);
    }
  }
  return commands;
}

export function redactHookPlanCommand(command: string): string {
  const home = homedir().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return command
    .replace(new RegExp(home, 'g'), '~')
    .replace(/\/Users\/[^\s"'`]+/g, '~')
    .replace(/((?:--?)?(?:api[-_]?key|token|secret|password)(?:=|\s+))[^\s&]+/gi, '$1[redacted]')
    .replace(/(Bearer\s+)[^\s&]+/gi, '$1[redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]+/g, 'sk-[redacted]');
}

function redactCommands(commands: string[]): string[] {
  return commands.map(redactHookPlanCommand);
}

export function getStatusLineCommand(statusLine: unknown): string {
  if (typeof statusLine === 'string') return statusLine;
  if (statusLine && typeof statusLine === 'object' && typeof (statusLine as { command?: unknown }).command === 'string') {
    return (statusLine as { command: string }).command;
  }
  return '';
}

export function isLazyBrainStatuslineCommand(command: unknown, statuslineScript?: string, combinedStatuslineScript?: string): command is string {
  if (typeof command !== 'string') return false;
  const normalized = command.replace(/\\/g, '/');
  const statusline = statuslineScript?.replace(/\\/g, '/');
  const combined = combinedStatuslineScript?.replace(/\\/g, '/');
  return Boolean(statusline && normalized.includes(statusline)) ||
    Boolean(combined && normalized.includes(combined)) ||
    /lazy[-_]?brain.*\/(?:dist\/)?bin\/statusline(?:-combined)?\.js\b/.test(normalized);
}

function hasLazyBrainEntry(entry: HookEntry): boolean {
  return isLazyBrainHookCommand(entry.command) ||
    nestedHooks(entry).some((hook) => isLazyBrainHookCommand(hook.command));
}

function hasThirdPartyEntry(entry: HookEntry): boolean {
  if (typeof entry.command === 'string' && !isLazyBrainHookCommand(entry.command)) return true;
  return nestedHooks(entry).some((hook) =>
    typeof hook.command === 'string' && !isLazyBrainHookCommand(hook.command),
  );
}

export function buildHookPlan(options: HookPlanOptions): HookPlan {
  const hooks = (options.settings.hooks ?? {}) as Record<string, unknown>;
  const ups = normalizeEntries(hooks.UserPromptSubmit);
  const stop = normalizeEntries(hooks.Stop);
  const sessionStart = normalizeEntries(hooks.SessionStart);
  const allEntries = Object.entries(hooks)
    .flatMap(([eventName, entries]) => normalizeEntries(entries).map((entry) => ({ eventName, entry })));

  const userPromptSubmitCommands = flattenCommands(ups);
  const stopCommands = flattenCommands(stop);
  const sessionStartCommands = flattenCommands(sessionStart);
  const thirdPartyCommands = [...new Set(
    allEntries.flatMap(({ entry }) =>
      flattenCommands([entry]).filter((command) => !isLazyBrainHookCommand(command)),
    ),
  )];
  const mixedEntries = allEntries.filter(({ entry }) => hasLazyBrainEntry(entry) && hasThirdPartyEntry(entry)).length;
  const removeEvents = [...new Set(
    allEntries
      .filter(({ entry }) => hasLazyBrainEntry(entry))
      .map(({ eventName }) => eventName),
  )];

  const existingStatuslineCommand = getStatusLineCommand(options.settings.statusLine);
  const inheritedStatuslineCommand = options.scope === 'project' && !existingStatuslineCommand
    ? getStatusLineCommand(options.globalSettings?.statusLine)
    : '';
  const upstreamStatuslineCommand = existingStatuslineCommand || inheritedStatuslineCommand;
  const hasOtherStatusline = Boolean(
    upstreamStatuslineCommand &&
    !isLazyBrainStatuslineCommand(upstreamStatuslineCommand, options.statuslineScript, options.combinedStatuslineScript),
  );
  const alreadyCombined = Boolean(existingStatuslineCommand && existingStatuslineCommand.includes('statusline-combined.js'));

  let statuslineMode: StatuslinePlanMode = 'none';
  let plannedStatuslineCommand = '';
  if (options.shouldReplaceStatusline) {
    statuslineMode = 'replace';
    plannedStatuslineCommand = `node ${options.statuslineScript}`;
  } else if (options.shouldInstallStatusline && hasOtherStatusline) {
    statuslineMode = 'combine';
    plannedStatuslineCommand = options.combinedStatuslineCommand;
  } else if (alreadyCombined) {
    statuslineMode = 'combine';
    plannedStatuslineCommand = options.combinedStatuslineCommand;
  } else if (
    isLazyBrainStatuslineCommand(existingStatuslineCommand, options.statuslineScript, options.combinedStatuslineScript) ||
    (!upstreamStatuslineCommand && options.shouldInstallStatusline)
  ) {
    statuslineMode = 'lazybrain';
    plannedStatuslineCommand = `node ${options.statuslineScript}`;
  } else if (hasOtherStatusline) {
    statuslineMode = 'skip';
  }

  const warnings: string[] = [];
  const blockers: string[] = [];
  if (options.scriptsReady === false) blockers.push('LazyBrain hook/statusline scripts are missing. Run `npm run build` first.');
  if (stopCommands.some(isLazyBrainHookCommand)) warnings.push('LazyBrain Stop registration will be removed during install.');
  if (sessionStartCommands.some(isLazyBrainHookCommand)) warnings.push('Legacy LazyBrain SessionStart registration will be removed during install.');
  if (mixedEntries > 0) warnings.push('Mixed hook entries detected; third-party hooks will be preserved.');
  if (statuslineMode === 'replace') warnings.push('Existing statusLine will be replaced because --replace-statusline was requested.');
  if (statuslineMode === 'combine' && inheritedStatuslineCommand) warnings.push('Project install will combine with inherited global statusLine.');

  const risk: HookPlanRisk = blockers.length > 0
    ? 'blocked'
    : warnings.length > 0
      ? 'needs_attention'
      : 'safe';

  return {
    risk,
    scope: options.scope,
    settingsPath: options.settingsPath,
    workspaceRoot: options.workspaceRoot,
    installStatePath: options.installStatePath,
    lifecycle: {
      UserPromptSubmit: redactCommands(userPromptSubmitCommands),
      Stop: redactCommands(stopCommands),
      SessionStart: redactCommands(sessionStartCommands),
    },
    lazybrain: {
      userPromptSubmit: userPromptSubmitCommands.some(isLazyBrainHookCommand),
      stop: stopCommands.some(isLazyBrainHookCommand),
      sessionStart: sessionStartCommands.some(isLazyBrainHookCommand),
      removeEvents,
      addUserPromptSubmit: true,
    },
    thirdParty: {
      commands: redactCommands(thirdPartyCommands),
      mixedEntries,
    },
    statusline: {
      mode: statuslineMode,
      existingCommand: redactHookPlanCommand(existingStatuslineCommand),
      inheritedCommand: redactHookPlanCommand(inheritedStatuslineCommand),
      plannedCommand: redactHookPlanCommand(plannedStatuslineCommand),
    },
    warnings,
    blockers,
  };
}

export function formatHookPlan(plan: HookPlan): string {
  const lines: string[] = [];
  lines.push('LazyBrain hook plan');
  lines.push(`  Risk: ${plan.risk}`);
  lines.push(`  Scope: ${plan.scope}${plan.workspaceRoot ? ` (${plan.workspaceRoot})` : ''}`);
  lines.push(`  Settings: ${plan.settingsPath}`);
  lines.push(`  Install state: ${plan.installStatePath}`);
  lines.push('');
  lines.push('Lifecycle:');
  for (const eventName of ['UserPromptSubmit', 'Stop', 'SessionStart'] as const) {
    const commands = plan.lifecycle[eventName];
    lines.push(`  ${eventName}: ${commands.length}`);
    for (const command of commands) {
      const kind = isLazyBrainHookCommand(command) ? 'lazybrain' : 'third-party';
      lines.push(`    - [${kind}] ${command}`);
    }
  }
  lines.push('');
  lines.push('Planned changes:');
  lines.push('  - Add LazyBrain UserPromptSubmit hook');
  if (plan.lazybrain.removeEvents.length > 0) {
    lines.push(`  - Remove existing LazyBrain hook registrations from: ${plan.lazybrain.removeEvents.join(', ')}`);
  }
  if (plan.thirdParty.commands.length > 0) {
    lines.push(`  - Preserve ${plan.thirdParty.commands.length} third-party hook command(s)`);
  }
  lines.push(`  - Statusline: ${plan.statusline.mode}${plan.statusline.plannedCommand ? ` (${plan.statusline.plannedCommand})` : ''}`);
  if (plan.statusline.existingCommand) lines.push(`    existing: ${plan.statusline.existingCommand}`);
  if (plan.statusline.inheritedCommand) lines.push(`    inherited: ${plan.statusline.inheritedCommand}`);
  if (plan.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of plan.warnings) lines.push(`  - ${warning}`);
  }
  if (plan.blockers.length > 0) {
    lines.push('');
    lines.push('Blockers:');
    for (const blocker of plan.blockers) lines.push(`  - ${blocker}`);
  }
  return lines.join('\n');
}
