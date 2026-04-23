/**
 * LazyBrain — LLM Provider
 *
 * Unified interface for calling LLMs during wiki compilation.
 * Supports any OpenAI-compatible API (MiniMax mirror, Ollama, Claude, OpenAI).
 */

import type { LLMProvider, LLMProviderConfig, LLMResponse } from '../types.js';

const OPENCODE_PRIMARY_MODEL = 'minimax-cn-coding-plan/MiniMax-M2.7';
const RATE_LIMIT_RETRY_COUNT = 3;
const RATE_LIMIT_WINDOW_START_BJT = 14;
const RATE_LIMIT_WINDOW_END_BJT = 18;
const DEFAULT_RETRY_BACKOFF_MS = 800;

function isHighSpeedModel(model: string): boolean {
  return /highspeed/i.test(model);
}

function isRateLimitRetryWindow(date: Date = new Date()): boolean {
  const bjtHour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    hour12: false,
  }).format(date));
  return bjtHour >= RATE_LIMIT_WINDOW_START_BJT && bjtHour < RATE_LIMIT_WINDOW_END_BJT;
}

function getRetryBackoffBaseMs(): number {
  const raw = process.env.LAZYBRAIN_429_BACKOFF_BASE_MS;
  if (!raw) return DEFAULT_RETRY_BACKOFF_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_RETRY_BACKOFF_MS;
  return parsed;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generic OpenAI-compatible LLM provider.
 * Works with: MiniMax (via mirror), Ollama, OpenAI, Anthropic (via proxy), etc.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  private model: string;
  private apiBase: string;
  private apiKey: string;
  private runtimePlatform?: LLMProviderConfig['runtimePlatform'];

  constructor(config: LLMProviderConfig) {
    this.model = config.model;
    this.apiBase = config.apiBase.replace(/\/$/, '');
    this.apiKey = config.apiKey ?? '';
    this.runtimePlatform = config.runtimePlatform;
    this.enforceModelGovernance(this.model);
  }

  async complete(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    const noThinkPrefix = this.model.toLowerCase().includes('qwen') ? '/no_think\n\n' : '';
    messages.push({ role: 'user', content: noThinkPrefix + prompt });

    const res = await this.requestWithGovernance(messages);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM API error ${res.status}: ${text}`);
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      content: data.choices[0]?.message?.content ?? '',
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
  }

  private enforceModelGovernance(model: string): void {
    if (isHighSpeedModel(model)) {
      throw new Error(`Governance blocked model "${model}": highspeed is forbidden.`);
    }

    if (this.runtimePlatform === 'opencode' && model.startsWith('minimax-cn-coding-plan/') && model !== OPENCODE_PRIMARY_MODEL) {
      throw new Error(
        `Governance blocked model "${model}" for OpenCode: minimax-cn-coding-plan only allows "${OPENCODE_PRIMARY_MODEL}".`,
      );
    }
  }

  private getBackupConfig(): { apiBase: string; apiKey: string; model: string } | null {
    const backupApiBase = process.env.LAZYBRAIN_LLM_BACKUP_API_BASE?.trim();
    if (!backupApiBase) return null;

    const backupModel = (process.env.LAZYBRAIN_LLM_BACKUP_MODEL?.trim() || this.model);
    this.enforceModelGovernance(backupModel);

    return {
      apiBase: backupApiBase.replace(/\/$/, ''),
      apiKey: process.env.LAZYBRAIN_LLM_BACKUP_API_KEY ?? this.apiKey,
      model: backupModel,
    };
  }

  private async requestOnce(
    apiBase: string,
    apiKey: string,
    model: string,
    messages: Array<{ role: string; content: string }>,
  ): Promise<Response> {
    return fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 512,
      }),
    });
  }

  private async requestWithGovernance(messages: Array<{ role: string; content: string }>): Promise<Response> {
    const inRetryWindow = isRateLimitRetryWindow();
    const backoffBaseMs = getRetryBackoffBaseMs();

    let lastResponse: Response | null = null;
    for (let retry = 0; retry <= RATE_LIMIT_RETRY_COUNT; retry++) {
      const response = await this.requestOnce(this.apiBase, this.apiKey, this.model, messages);
      if (response.status !== 429) {
        return response;
      }
      lastResponse = response;

      if (!inRetryWindow || retry === RATE_LIMIT_RETRY_COUNT) {
        break;
      }

      const backoffMs = backoffBaseMs * Math.pow(2, retry);
      await sleep(backoffMs);
    }

    if (!inRetryWindow) {
      return lastResponse ?? this.requestOnce(this.apiBase, this.apiKey, this.model, messages);
    }

    const backup = this.getBackupConfig();
    if (backup) {
      return this.requestOnce(backup.apiBase, backup.apiKey, backup.model, messages);
    }

    return lastResponse ?? this.requestOnce(this.apiBase, this.apiKey, this.model, messages);
  }
}

/**
 * Create an LLM provider from user config.
 */
export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  return new OpenAICompatibleProvider(config);
}
