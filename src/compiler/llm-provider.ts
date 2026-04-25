/**
 * LazyBrain — LLM Provider
 *
 * Unified interface for calling LLMs during wiki compilation.
 * Supports any OpenAI-compatible API (MiniMax mirror, Ollama, Claude, OpenAI).
 */

import type { LLMProvider, LLMProviderConfig, LLMResponse } from '../types.js';

/**
 * Generic OpenAI-compatible LLM provider.
 * Works with: MiniMax (via mirror), Ollama, OpenAI, Anthropic (via proxy), etc.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  private model: string;
  private apiBase: string;
  private apiKey: string;

  constructor(config: LLMProviderConfig) {
    this.model = config.model;
    this.apiBase = config.apiBase.replace(/\/$/, '');
    this.apiKey = config.apiKey ?? '';
  }

  async complete(prompt: string, systemPrompt?: string, options?: { signal?: AbortSignal }): Promise<LLMResponse> {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    // Qwen 模型需要 /no_think 前缀关闭思考模式
    const noThinkPrefix = this.model.toLowerCase().includes('qwen') ? '/no_think\n\n' : '';
    messages.push({ role: 'user', content: noThinkPrefix + prompt });

    const res = await fetch(`${this.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.3,
        max_tokens: 512,
      }),
      signal: options?.signal,
    });

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
}

/**
 * Create an LLM provider from user config.
 */
export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  return new OpenAICompatibleProvider(config);
}
