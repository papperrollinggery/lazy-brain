import { createHash } from 'node:crypto';

const REDACTED_PROMPT_PREFIX = '[redacted-prompt:';

export function hashPrompt(prompt: string): string {
  return createHash('sha1').update(prompt).digest('hex').slice(0, 16);
}

export function redactedPromptLabel(hash: string): string {
  return `${REDACTED_PROMPT_PREFIX}${hash}]`;
}

export function isRedactedPromptLabel(value: string): boolean {
  return value.startsWith(REDACTED_PROMPT_PREFIX) && value.endsWith(']');
}

export function redactPromptForStorage(prompt: string): { query: string; queryHash: string } {
  if (isRedactedPromptLabel(prompt)) {
    return { query: prompt, queryHash: prompt.slice(REDACTED_PROMPT_PREFIX.length, -1) };
  }
  const queryHash = hashPrompt(prompt);
  return { query: redactedPromptLabel(queryHash), queryHash };
}

export function sanitizePromptRecord<T extends { query?: unknown; queryHash?: unknown }>(entry: T): T & { query?: string; queryHash?: string } {
  if (typeof entry.query !== 'string') return entry as T & { query?: string; queryHash?: string };
  const redacted = typeof entry.queryHash === 'string'
    ? { query: redactedPromptLabel(entry.queryHash), queryHash: entry.queryHash }
    : redactPromptForStorage(entry.query);
  return { ...entry, ...redacted };
}
