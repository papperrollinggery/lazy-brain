type HookCommand = {
  type?: string;
  command?: unknown;
  timeout?: number;
};

type HookEntry = {
  matcher?: unknown;
  hooks?: HookCommand[];
  command?: unknown;
};

type SettingsObject = Record<string, unknown> & {
  hooks?: Record<string, unknown>;
};

function nestedHooks(entry: HookEntry): HookCommand[] {
  return Array.isArray(entry.hooks) ? entry.hooks : [];
}

export function isLazyBrainHookCommand(command: unknown): boolean {
  if (typeof command !== 'string') return false;
  const normalized = command.replace(/\\/g, '/');
  return /lazy[-_]?brain.*\/(?:dist\/)?bin\/hook\.js\b/.test(normalized);
}

function stripLazyBrainEntries(entries: HookEntry[]): HookEntry[] {
  return entries
    .map((entry) => {
      const next: HookEntry = { ...entry };
      if (isLazyBrainHookCommand(next.command)) {
        delete next.command;
      }
      if (Array.isArray(next.hooks)) {
        next.hooks = next.hooks.filter((hook) => !isLazyBrainHookCommand(hook.command));
      }
      const hasCommand = typeof next.command === 'string';
      const hasHooks = Array.isArray(next.hooks) && next.hooks.length > 0;
      return hasCommand || hasHooks ? next : null;
    })
    .filter((entry): entry is HookEntry => entry !== null);
}

function stripLazyBrainFromAllHookEvents(hooks: Record<string, unknown>): void {
  for (const [eventName, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    hooks[eventName] = stripLazyBrainEntries(entries as HookEntry[]);
  }
}

export function upsertLazyBrainUserPromptSubmit(
  settings: SettingsObject,
  hookCommand: string,
): SettingsObject {
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  stripLazyBrainFromAllHookEvents(hooks);
  const ups = (hooks.UserPromptSubmit ?? []) as HookEntry[];

  hooks.UserPromptSubmit = [
    ...ups,
    { matcher: '', hooks: [{ type: 'command', command: hookCommand, timeout: 5 }] },
  ];
  settings.hooks = hooks;
  return settings;
}

export function removeLazyBrainHookRegistrations(settings: SettingsObject): SettingsObject {
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  stripLazyBrainFromAllHookEvents(hooks);
  settings.hooks = hooks;
  return settings;
}

export function hasLazyBrainHookRegistration(settings: SettingsObject): boolean {
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  return Object.values(hooks).some((entries) => {
    if (!Array.isArray(entries)) return false;
    return (entries as HookEntry[]).some((entry) =>
      isLazyBrainHookCommand(entry.command) ||
      nestedHooks(entry).some((hook) => isLazyBrainHookCommand(hook.command)),
    );
  });
}
