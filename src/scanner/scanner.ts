/**
 * LazyBrain — File Scanner
 *
 * Discovers and scans capability files from configured paths.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename, resolve } from 'node:path';

import type { RawCapability, Platform } from '../types.js';
import { getDefaultScanPaths, inferPlatformFromPath } from '../constants.js';
import { parseSkill } from './parsers/skill-parser.js';
import { parseAgent } from './parsers/agent-parser.js';
import { parseCommand } from './parsers/command-parser.js';
import { dedup } from './dedup.js';

export interface ScanOptions {
  extraPaths?: string[];
  sources?: ScanSource[];
  onProgress?: (scanned: number, found: number) => void;
  /** Current platform for tier assignment */
  platform?: Platform;
  /** Platforms to scan (default: only current platform) */
  platforms?: Record<string, boolean>;
}

export interface ScanSource {
  tool: 'claude-code' | 'cursor' | 'windsurf' | 'cline' | 'custom';
  paths: string[];
  parser: 'skill-md' | 'cursorrules' | 'json' | 'markdown';
}

export interface ScanResult {
  capabilities: RawCapability[];
  scannedFiles: number;
  scannedPaths: number;
  errors: string[];
}

export function detectSources(): ScanSource[] {
  const home = homedir();
  const cwd = process.cwd();
  const candidates: ScanSource[] = [
    { tool: 'claude-code', parser: 'skill-md', paths: [join(home, '.claude', 'skills'), join(home, '.claude', 'commands'), join(cwd, '.claude', 'commands')] },
    { tool: 'cursor', parser: 'cursorrules', paths: [join(cwd, '.cursorrules'), join(cwd, '.cursor', 'rules'), join(home, '.cursor', 'rules')] },
    { tool: 'windsurf', parser: 'markdown', paths: [join(cwd, '.windsurfrules'), join(home, '.windsurf', 'rules')] },
    { tool: 'cline', parser: 'markdown', paths: [join(cwd, '.clinerules'), join(home, '.cline', 'rules')] },
    { tool: 'custom', parser: 'skill-md', paths: [join(home, '.skillshub'), join(home, '.codex', 'skills'), join(home, '.agents', 'skills')] },
  ];
  return candidates
    .map((source) => ({ ...source, paths: source.paths.map((path) => resolve(path)).filter(existsSync) }))
    .filter((source) => source.paths.length > 0);
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

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isSkillRootPath(path: string): boolean {
  return path.includes('/skills') || path.includes('/skills-disabled') || basename(path) === '.skillshub';
}

function parseRuleFile(filePath: string, content: string, tool: string): RawCapability | null {
  const name = basename(filePath).replace(/^\./, '').replace(/\.[^.]+$/, '') || `${tool}-rules`;
  const firstLine = content.split('\n').map((line) => line.trim()).find(Boolean);
  return {
    kind: 'skill',
    name: `${tool}-${name}`,
    description: firstLine?.slice(0, 180) || `${tool} local rule file`,
    origin: tool,
    filePath,
    triggers: [tool, name, `${tool} rules`],
    compatibility: tool === 'cursor' ? ['cursor'] : ['universal'],
    platform: tool === 'cursor' ? 'cursor' : 'universal',
  };
}

export function scan(options?: ScanOptions): ScanResult {
  const sourcePaths = (options?.sources ?? detectSources()).flatMap((source) => source.paths);
  const paths = [...new Set([...getDefaultScanPaths(options?.platforms), ...sourcePaths, ...(options?.extraPaths ?? [])])];
  const capabilities: RawCapability[] = [];
  const errors: string[] = [];
  let scannedFiles = 0;
  let scannedPaths = 0;

  for (const path of paths) {
    scannedPaths++;
    if (!existsSync(path)) continue;

    if (isFile(path)) {
      scannedFiles++;
      const content = safeReadFile(path);
      if (content === null) {
        errors.push(`Failed to read: ${path}`);
        continue;
      }
      const tool = path.includes('cursor') ? 'cursor' : path.includes('windsurf') ? 'windsurf' : path.includes('cline') ? 'cline' : 'custom';
      const capability = parseRuleFile(path, content, tool);
      if (capability) capabilities.push(capability);
      continue;
    }

    if (!isDirectory(path)) continue;

    try {
      if (isSkillRootPath(path)) {
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
