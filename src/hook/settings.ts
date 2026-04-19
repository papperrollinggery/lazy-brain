type HookCommand = {
  type?: string;
  command?: unknown;
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
  return typeof command === 'string'
    && (command.includes('dist/bin/hook.js') || command.includes('/bin/hook.js'));
}

function stripLazyBrainEntries(entries: HookEntry[]): HookEntry[] {
  return entries.filter((entry) => {
    if (isLazyBrainHookCommand(entry.command)) return false;
    if (nestedHooks(entry).some((hook) => isLazyBrainHookCommand(hook.command))) return false;
    return true;
  });
}

export function upsertLazyBrainUserPromptSubmit(
  settings: SettingsObject,
  hookCommand: string,
): SettingsObject {
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const ups = (hooks.UserPromptSubmit ?? []) as HookEntry[];
  const stop = (hooks.Stop ?? []) as HookEntry[];

  hooks.UserPromptSubmit = [
    ...stripLazyBrainEntries(ups),
    { matcher: '', hooks: [{ type: 'command', command: hookCommand }] },
  ];
  hooks.Stop = stripLazyBrainEntries(stop);
  settings.hooks = hooks;
  return settings;
}

export function removeLazyBrainHookRegistrations(settings: SettingsObject): SettingsObject {
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const ups = (hooks.UserPromptSubmit ?? []) as HookEntry[];
  const stop = (hooks.Stop ?? []) as HookEntry[];

  hooks.UserPromptSubmit = stripLazyBrainEntries(ups);
  hooks.Stop = stripLazyBrainEntries(stop);
  settings.hooks = hooks;
  return settings;
}
