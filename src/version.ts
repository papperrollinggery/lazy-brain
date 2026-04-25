import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FALLBACK_VERSION = '1.3.0';

let cachedVersion: string | null = null;

function readPackageVersion(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8')) as { name?: unknown; version?: unknown };
    if (data.name !== 'lazybrain') return null;
    return typeof data.version === 'string' && data.version.trim() ? data.version.trim() : null;
  } catch {
    return null;
  }
}

export function getPackageVersion(): string {
  if (cachedVersion) return cachedVersion;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../../package.json'),
    resolve(here, '../package.json'),
    resolve(here, 'package.json'),
    resolve(process.cwd(), 'package.json'),
  ];
  for (const candidate of candidates) {
    const version = readPackageVersion(candidate);
    if (version) {
      cachedVersion = version;
      return version;
    }
  }
  cachedVersion = FALLBACK_VERSION;
  return cachedVersion;
}
