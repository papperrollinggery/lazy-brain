import type { TaskSignal } from './types.js';

export function signalFromQuery(query: string): TaskSignal {
  return {
    source: 'user_query',
    content: query.trim(),
    context: {},
  };
}

export function signalFromFileChange(files: string[]): TaskSignal {
  return {
    source: 'file_change',
    content: files.join(' '),
    context: { files_changed: files },
  };
}

export function signalFromHook(input: unknown): TaskSignal {
  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const prompt = typeof record.prompt === 'string'
    ? record.prompt
    : typeof record.user_prompt === 'string'
      ? record.user_prompt
      : '';
  return {
    source: 'user_query',
    content: prompt,
    context: {},
  };
}
