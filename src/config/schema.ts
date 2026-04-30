export const CONFIG_ALLOWED_KEYS = new Set([
  'compileApiBase', 'compileApiKey', 'compileModel',
  'embeddingApiBase', 'embeddingApiKey', 'embeddingModel', 'embeddingSource',
  'secretaryApiBase', 'secretaryApiKey', 'secretaryModel',
  'engine', 'strategy', 'mode', 'autoThreshold', 'language',
  'compileSystemPrompt', 'compileTagPrompt', 'compileRelationPrompt',
]);

export const VALID_ENGINES = new Set(['tag', 'semantic', 'hybrid', 'llm']);
export const VALID_STRATEGIES = new Set(['always-main', 'optimal', 'ask']);
export const VALID_MODES = new Set(['auto', 'select', 'ask']);
export const VALID_LANGUAGES = new Set(['auto', 'en', 'zh']);
export const VALID_EMBEDDING_SOURCES = new Set(['api', 'custom', 'local']);
export const SECRET_CONFIG_KEYS = new Set(['compileApiKey', 'embeddingApiKey', 'secretaryApiKey']);

export type ConfigUpdatePatch = Record<string, unknown>;

export type ConfigUpdateValidation =
  | { ok: true; patch: ConfigUpdatePatch; ignoredKeys: string[] }
  | { ok: false; error: string };

export function sanitizeConfigUpdate(body: Record<string, unknown>): { patch: ConfigUpdatePatch; ignoredKeys: string[] } {
  const patch: ConfigUpdatePatch = {};
  const ignoredKeys: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (SECRET_CONFIG_KEYS.has(key) && typeof value === 'string' && value.trim() === '') {
      ignoredKeys.push(key);
      continue;
    }
    patch[key] = value;
  }
  return { patch, ignoredKeys };
}

function formatAllowed(values: Set<string>): string {
  return [...values].join(', ');
}

function validateEnum(key: string, value: unknown, values: Set<string>): string | null {
  if (typeof value !== 'string' || !values.has(value)) {
    return `Invalid ${key}. Must be one of: ${formatAllowed(values)}`;
  }
  return null;
}

export function validateConfigUpdate(body: Record<string, unknown>): ConfigUpdateValidation {
  for (const key of Object.keys(body)) {
    if (!CONFIG_ALLOWED_KEYS.has(key)) {
      return { ok: false, error: `Unknown config key: ${key}` };
    }
  }

  for (const [key, value] of Object.entries(body)) {
    if (key === 'autoThreshold') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        return { ok: false, error: 'autoThreshold must be a finite number between 0 and 1' };
      }
    } else if (key === 'engine') {
      const error = validateEnum(key, value, VALID_ENGINES);
      if (error) return { ok: false, error };
    } else if (key === 'strategy') {
      const error = validateEnum(key, value, VALID_STRATEGIES);
      if (error) return { ok: false, error };
    } else if (key === 'mode') {
      const error = validateEnum(key, value, VALID_MODES);
      if (error) return { ok: false, error };
    } else if (key === 'language') {
      const error = validateEnum(key, value, VALID_LANGUAGES);
      if (error) return { ok: false, error };
    } else if (key === 'embeddingSource') {
      const error = validateEnum(key, value, VALID_EMBEDDING_SOURCES);
      if (error) return { ok: false, error };
    } else if (typeof value !== 'string') {
      return { ok: false, error: `config key "${key}" must be a string` };
    }
  }

  return { ok: true, ...sanitizeConfigUpdate(body) };
}
