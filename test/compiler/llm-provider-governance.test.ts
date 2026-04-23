import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLLMProvider } from '../../src/compiler/llm-provider.js';

function makeOkResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('llm provider governance', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('blocks highspeed model', () => {
    expect(() => createLLMProvider({
      model: 'foo-highspeed',
      apiBase: 'https://example.com/v1',
      apiKey: 'k',
    })).toThrow('highspeed is forbidden');
  });

  it('blocks non-M2.7 minimax plan model for opencode runtime', () => {
    expect(() => createLLMProvider({
      model: 'minimax-cn-coding-plan/MiniMax-M2.8',
      apiBase: 'https://example.com/v1',
      apiKey: 'k',
      runtimePlatform: 'opencode',
    })).toThrow('only allows "minimax-cn-coding-plan/MiniMax-M2.7"');
  });

  it('retries 3+ times and switches to backup in 14:00-18:00 BJT window', async () => {
    vi.setSystemTime(new Date('2026-04-23T07:00:00.000Z'));

    process.env.LAZYBRAIN_429_BACKOFF_BASE_MS = '0';
    process.env.LAZYBRAIN_LLM_BACKUP_API_BASE = 'https://backup.example.com/v1';
    process.env.LAZYBRAIN_LLM_BACKUP_API_KEY = 'backup-key';
    process.env.LAZYBRAIN_LLM_BACKUP_MODEL = 'backup-model';

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('rate-limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('rate-limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('rate-limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('rate-limited', { status: 429 }))
      .mockResolvedValueOnce(makeOkResponse('{"ok":true}'));

    vi.stubGlobal('fetch', fetchMock);

    const provider = createLLMProvider({
      model: 'normal-model',
      apiBase: 'https://primary.example.com/v1',
      apiKey: 'primary-key',
    });

    const result = await provider.complete('hello');

    expect(result.content).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls[0][0]).toBe('https://primary.example.com/v1/chat/completions');
    expect(fetchMock.mock.calls[4][0]).toBe('https://backup.example.com/v1/chat/completions');

    const firstBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    const lastBody = JSON.parse(String((fetchMock.mock.calls[4][1] as RequestInit).body));
    expect(firstBody.model).toBe('normal-model');
    expect(lastBody.model).toBe('backup-model');
  });

  it('does not retry outside 14:00-18:00 BJT window', async () => {
    vi.setSystemTime(new Date('2026-04-23T02:00:00.000Z'));

    process.env.LAZYBRAIN_LLM_BACKUP_API_BASE = 'https://backup.example.com/v1';

    const fetchMock = vi.fn().mockResolvedValue(new Response('rate-limited', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createLLMProvider({
      model: 'normal-model',
      apiBase: 'https://primary.example.com/v1',
      apiKey: 'primary-key',
    });

    await expect(provider.complete('hello')).rejects.toThrow('LLM API error 429');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
