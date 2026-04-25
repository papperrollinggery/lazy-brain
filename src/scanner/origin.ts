import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';

function readPluginManifest(dirPath: string): { name?: string; version?: string } | null {
  const candidates = [
    join(dirPath, '.claude-plugin', 'plugin.json'),
    join(dirPath, 'plugin.json'),
    join(dirPath, 'package.json'),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const raw = JSON.parse(readFileSync(candidate, 'utf-8')) as { name?: unknown; version?: unknown };
      const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : undefined;
      const version = typeof raw.version === 'string' && raw.version.trim() ? raw.version.trim() : undefined;
      if (name) return { name, version };
    } catch {}
  }

  return null;
}

function pluginOriginFromManifest(filePath: string): string | null {
  let dir = dirname(filePath);
  const root = dirname(dir);

  while (dir && dir !== root) {
    const manifest = readPluginManifest(dir);
    if (manifest?.name) {
      return manifest.version
        ? `plugin:${manifest.name}@${manifest.version}`
        : `plugin:${manifest.name}`;
    }
    const next = dirname(dir);
    if (next === dir) break;
    dir = next;
  }

  return null;
}

function pluginOriginFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const idx = parts.lastIndexOf('plugins');
  if (idx === -1) return 'plugin';

  const first = parts[idx + 1];
  if (first === 'cache') {
    const name = parts[idx + 2];
    const version = parts[idx + 4] && /^\d+\.\d+\.\d+/.test(parts[idx + 4]) ? parts[idx + 4] : undefined;
    return name ? (version ? `plugin:${name}@${version}` : `plugin:${name}`) : 'plugin';
  }

  if (first === 'marketplaces') {
    const name = parts[idx + 2];
    return name ? `plugin:${name}` : 'plugin';
  }

  return first ? `plugin:${first}` : `plugin:${basename(dirname(filePath.split(sep).join('/')))}`;
}

export function inferOrigin(filePath: string, frontmatterOrigin?: string): string {
  if (frontmatterOrigin) return frontmatterOrigin;
  if (filePath.includes('/ecc/')) return 'ECC';
  if (filePath.includes('/plugins/')) {
    return pluginOriginFromManifest(filePath) ?? pluginOriginFromPath(filePath);
  }
  return 'local';
}
