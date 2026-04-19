/**
 * LazyBrain — File Scanner
 *
 * Discovers and scans capability files from configured paths.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

import type { RawCapability, Platform } from '../types.js';
import { getDefaultScanPaths, inferPlatformFromPath } from '../constants.js';
import { parseSkill } from './parsers/skill-parser.js';
import { parseAgent } from './parsers/agent-parser.js';
import { parseCommand } from './parsers/command-parser.js';
import { dedup } from './dedup.js';

export interface ScanOptions {
  extraPaths?: string[];
  onProgress?: (scanned: number, found: number) => void;
  /** Current platform for tier assignment */
  platform?: Platform;
  /** Platforms to scan (default: only current platform) */
  platforms?: Record<string, boolean>;
}

export interface ScanResult {
  capabilities: RawCapability[];
  scannedFiles: number;
  scannedPaths: number;
  errors: string[];
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function findSkillFiles(dirPath: string): string[] {
  const results: string[] = [];
  if (!existsSync(dirPath)) return results;

  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillPath = join(dirPath, entry.name, 'SKILL.md');
      if (existsSync(skillPath)) {
        results.push(skillPath);
      } else {
        results.push(...findSkillFiles(join(dirPath, entry.name)));
      }
    }
  }
  return results;
}

function findMarkdownFiles(dirPath: string): string[] {
  const results: string[] = [];
  if (!existsSync(dirPath)) return results;

  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(join(dirPath, entry.name));
    }
  }
  return results;
}

function findMarkdownFilesInNamedDirs(rootPath: string, targetDirName: string): string[] {
  const results: string[] = [];
  if (!existsSync(rootPath)) return results;

  const entries = readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const childPath = join(rootPath, entry.name);
    if (entry.name === targetDirName) {
      results.push(...findMarkdownFiles(childPath));
      continue;
    }

    results.push(...findMarkdownFilesInNamedDirs(childPath, targetDirName));
  }

  return results;
}

function safeReadFile(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (err) {
    return null;
  }
}

export function scan(options?: ScanOptions): ScanResult {
  const paths = [...getDefaultScanPaths(options?.platforms), ...(options?.extraPaths ?? [])];
  const capabilities: RawCapability[] = [];
  const errors: string[] = [];
  let scannedFiles = 0;
  let scannedPaths = 0;

  for (const path of paths) {
    scannedPaths++;
    if (!existsSync(path) || !isDirectory(path)) continue;

    try {
      if (path.includes('/skills') || path.includes('/skills-disabled')) {
        const skillFiles = findSkillFiles(path);
        for (const filePath of skillFiles) {
          scannedFiles++;
          const content = safeReadFile(filePath);
          if (content === null) {
            errors.push(`Failed to read: ${filePath}`);
            continue;
          }
          const capability = parseSkill(filePath, content);
          if (capability) {
            capability.disabled = filePath.includes('/skills-disabled/');
            capabilities.push(capability);
          }
        }
      } else if (path.includes('/agents')) {
        const mdFiles = findMarkdownFiles(path);
        for (const filePath of mdFiles) {
          scannedFiles++;
          const content = safeReadFile(filePath);
          if (content === null) {
            errors.push(`Failed to read: ${filePath}`);
            continue;
          }
          const capability = parseAgent(filePath, content);
          if (capability) {
            capability.disabled = filePath.includes('/skills-disabled/');
            capabilities.push(capability);
          }
        }
      } else if (path.includes('/commands')) {
        const mdFiles = findMarkdownFiles(path);
        for (const filePath of mdFiles) {
          scannedFiles++;
          const content = safeReadFile(filePath);
          if (content === null) {
            errors.push(`Failed to read: ${filePath}`);
            continue;
          }
          const capability = parseCommand(filePath, content);
          if (capability) {
            capability.disabled = filePath.includes('/skills-disabled/');
            capabilities.push(capability);
          }
        }
      } else if (path.includes('/plugins')) {
        const skillFiles = findSkillFiles(path);
        for (const filePath of skillFiles) {
          scannedFiles++;
          const content = safeReadFile(filePath);
          if (content === null) {
            errors.push(`Failed to read: ${filePath}`);
            continue;
          }
          const capability = parseSkill(filePath, content);
          if (capability) {
            capability.disabled = filePath.includes('/skills-disabled/');
            capabilities.push(capability);
          }
        }

        const agentFiles = findMarkdownFilesInNamedDirs(path, 'agents');
        for (const filePath of agentFiles) {
          scannedFiles++;
          const content = safeReadFile(filePath);
          if (content === null) {
            errors.push(`Failed to read: ${filePath}`);
            continue;
          }
          const capability = parseAgent(filePath, content);
          if (capability) {
            capability.disabled = filePath.includes('/skills-disabled/');
            capabilities.push(capability);
          }
        }

        const commandFiles = findMarkdownFilesInNamedDirs(path, 'commands');
        for (const filePath of commandFiles) {
          scannedFiles++;
          const content = safeReadFile(filePath);
          if (content === null) {
            errors.push(`Failed to read: ${filePath}`);
            continue;
          }
          const capability = parseCommand(filePath, content);
          if (capability) {
            capability.disabled = filePath.includes('/skills-disabled/');
            capabilities.push(capability);
          }
        }
      }

      options?.onProgress?.(scannedFiles, capabilities.length);
    } catch (err) {
      errors.push(`Error scanning ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const deduplicated = dedup(capabilities);

  // Assign tiers based on platform
  if (options?.platform) {
    assignTiers(deduplicated, options.platform);
  }

  return {
    capabilities: deduplicated,
    scannedFiles,
    scannedPaths,
    errors,
  };
}

/**
 * Assign compilation tiers to capabilities based on current platform.
 *   tier 0: compatible with current platform
 *   tier 1: universal
 *   tier 2: other platform-specific
 */
function assignTiers(capabilities: RawCapability[], platform: Platform): void {
  for (const cap of capabilities) {
    if (cap.compatibility.includes(platform)) {
      cap.tier = 0;
    } else if (cap.compatibility.includes('universal')) {
      cap.tier = 1;
    } else {
      cap.tier = 2;
    }
  }
}
