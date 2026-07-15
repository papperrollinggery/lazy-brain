import type { Platform, RawCapability } from '../../types.js';
import { inferPlatformFromPath, inferSinglePlatformFromPath } from '../../constants.js';

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function platformForManifest(filePath: string): { compatibility: Platform[]; platform: Platform } {
  return {
    compatibility: inferPlatformFromPath(filePath),
    platform: inferSinglePlatformFromPath(filePath),
  };
}

function pluginCapability(filePath: string, manifest: JsonObject): RawCapability | null {
  const name = typeof manifest.name === 'string' ? manifest.name.trim() : '';
  if (!name) return null;
  const version = typeof manifest.version === 'string' ? manifest.version.trim() : undefined;
  const ui = object(manifest.interface);
  const description = [manifest.description, ui?.shortDescription, ui?.longDescription]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim() ?? `Installed plugin ${name}`;
  const displayName = typeof ui?.displayName === 'string' ? ui.displayName : undefined;
  return {
    kind: 'plugin',
    name,
    description,
    origin: version ? `plugin:${name}@${version}` : `plugin:${name}`,
    provider: typeof object(manifest.author)?.name === 'string' ? object(manifest.author)?.name as string : undefined,
    filePath,
    triggers: [...new Set([name, displayName, ...strings(manifest.keywords)].filter((value): value is string => Boolean(value)))],
    meta: {
      version,
      url: typeof manifest.homepage === 'string' ? manifest.homepage : typeof manifest.repository === 'string' ? manifest.repository : undefined,
    },
    ...platformForManifest(filePath),
  };
}

export function parsePluginManifest(filePath: string, content: string): RawCapability | null {
  try {
    return pluginCapability(filePath, object(JSON.parse(content)) ?? {});
  } catch {
    return null;
  }
}

export function parsePluginMarketplace(filePath: string, content: string): RawCapability[] {
  try {
    const root = object(JSON.parse(content));
    const entries = Array.isArray(root?.plugins) ? root.plugins : [];
    return entries.flatMap((entry) => {
      const value = object(entry);
      if (!value) return [];
      const source = object(value.source);
      const manifest = {
        name: value.name,
        description: typeof value.description === 'string' ? value.description : `Plugin listed in ${filePath}`,
        version: typeof value.version === 'string' ? value.version : undefined,
        repository: typeof source?.url === 'string' ? source.url : undefined,
        keywords: [typeof value.category === 'string' ? value.category : '', 'plugin marketplace'],
      };
      const capability = pluginCapability(filePath, manifest);
      return capability ? [capability] : [];
    });
  } catch {
    return [];
  }
}
