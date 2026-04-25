import type { UserConfig } from '../types.js';

export type ApiTestTarget = 'compile' | 'secretary' | 'embedding';

export interface ApiTestResult {
  target: ApiTestTarget;
  ok: boolean;
  configured: boolean;
  status?: number;
  apiBase?: string;
  model?: string;
  dim?: number;
  error?: string;
}

export interface ApiTestReport {
  ok: boolean;
  results: ApiTestResult[];
  testedAt: string;
}

function summarizeError(text: string): string {
  return text.replace(/\s+/g, ' ').slice(0, 220);
}

function publicBase(apiBase?: string): string | undefined {
  return apiBase?.replace(/\/$/, '').replace(/\/v\d+.*$/, '/v*');
}

async function testChat(
  target: ApiTestTarget,
  apiBase: string | undefined,
  apiKey: string | undefined,
  model: string | undefined,
): Promise<ApiTestResult> {
  const configured = Boolean(apiBase && apiKey && model);
  if (!configured) return { target, ok: false, configured, apiBase: publicBase(apiBase), model, error: 'missing config' };
  try {
    const res = await fetch(`${apiBase!.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Return exactly: OK' }],
        max_tokens: 8,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    return {
      target,
      ok: res.ok,
      configured,
      status: res.status,
      apiBase: publicBase(apiBase),
      model,
      error: res.ok ? undefined : summarizeError(text),
    };
  } catch (err) {
    return {
      target,
      ok: false,
      configured,
      apiBase: publicBase(apiBase),
      model,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function testEmbedding(config: UserConfig): Promise<ApiTestResult> {
  const apiBase = config.embeddingApiBase;
  const apiKey = config.embeddingApiKey;
  const model = config.embeddingModel;
  const configured = Boolean(apiBase && apiKey && model);
  if (!configured) return { target: 'embedding', ok: false, configured, apiBase: publicBase(apiBase), model, error: 'missing config' };
  try {
    const res = await fetch(`${apiBase!.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: 'lazybrain api smoke test' }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        target: 'embedding',
        ok: false,
        configured,
        status: res.status,
        apiBase: publicBase(apiBase),
        model,
        error: summarizeError(text),
      };
    }
    let dim = 0;
    try {
      const data = JSON.parse(text) as { data?: Array<{ embedding?: unknown }> };
      const vector = data.data?.[0]?.embedding;
      dim = Array.isArray(vector) ? vector.length : 0;
    } catch {
      return { target: 'embedding', ok: false, configured, status: res.status, apiBase: publicBase(apiBase), model, error: 'bad JSON response' };
    }
    return {
      target: 'embedding',
      ok: dim > 0,
      configured,
      status: res.status,
      apiBase: publicBase(apiBase),
      model,
      dim,
      error: dim > 0 ? undefined : 'embedding API returned no vector',
    };
  } catch (err) {
    return {
      target: 'embedding',
      ok: false,
      configured,
      apiBase: publicBase(apiBase),
      model,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runApiTests(
  config: UserConfig,
  targets: ApiTestTarget[] = ['compile', 'secretary', 'embedding'],
): Promise<ApiTestReport> {
  const results: ApiTestResult[] = [];
  for (const target of targets) {
    if (target === 'compile') {
      results.push(await testChat('compile', config.compileApiBase, config.compileApiKey, config.compileModel));
    } else if (target === 'secretary') {
      results.push(await testChat(
        'secretary',
        config.secretaryApiBase ?? config.compileApiBase,
        config.secretaryApiKey ?? config.compileApiKey,
        config.secretaryModel ?? config.compileModel,
      ));
    } else {
      results.push(await testEmbedding(config));
    }
  }
  return {
    ok: results.every(result => result.ok),
    results,
    testedAt: new Date().toISOString(),
  };
}
