/**
 * LazyBrain — File Scanner
 *
 * Discovers and scans capability files from configured paths.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

import type { RawCapability } from '../types.js';
import { getDefaultScanPaths, inferPlatformFromPath } from '../constants.js';
import { parseSkill } from './parsers/skill-parser.js';
import { parseAgent } from './parsers/agent-parser.js';
import { parseCommand } from './parsers/command-parser.js';
import { dedup } from './dedup.js';

export interface ScanOptions {
  extraPaths?: string[];
  onProgress?: (scanned: number, found: number) => void;
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

function safeReadFile(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (err) {
    return null;
  }
}

export function scan(options?: ScanOptions): ScanResult {
  const paths = [...getDefaultScanPaths(), ...(options?.extraPaths ?? [])];
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
          if (capability) capabilities.push(capability);
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
          if (capability) capabilities.push(capability);
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
          if (capability) capabilities.push(capability);
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
          if (capability) capabilities.push(capability);
        }
      }

      options?.onProgress?.(scannedFiles, capabilities.length);
    } catch (err) {
      errors.push(`Error scanning ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const deduplicated = dedup(capabilities);

  return {
    capabilities: deduplicated,
    scannedFiles,
    scannedPaths,
    errors,
  };
}
