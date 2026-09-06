/** Discover only capability metadata; discovery never proves runtime callability. */
import { readdirSync, readFileSync, existsSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';

import type { RawCapability, Platform } from '../types.js';
import { getCodexHome, getDefaultScanPaths } from '../constants.js';
import { parseSkill } from './parsers/skill-parser.js';
import { parseAgent, parseCodexAgentMetadata } from './parsers/agent-parser.js';
import { parseCommand } from './parsers/command-parser.js';
import { parseMcpConfig } from './parsers/mcp-parser.js';
import { parsePluginManifest, parsePluginMarketplace } from './parsers/plugin-parser.js';
import { dedup } from './dedup.js';

const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', '.DS_Store', '__tests__', 'test', 'tests', 'fixtures', 'examples']);
const MAX_FILES_PER_ROOT = 5_000;
const MAX_DIRECTORIES_PER_ROOT = 1_000;
const MAX_ENTRIES_PER_DIRECTORY = 2_000;
const MAX_METADATA_BYTES = 512 * 1024;
const MAX_PATH_LENGTH = 4_096;

export interface ScanOptions {
  extraPaths?: string[];
  sources?: ScanSource[];
  includeDefaults?: boolean;
  onProgress?: (scanned: number, found: number) => void;
  platform?: Platform;
  platforms?: Record<string, boolean>;
  cwd?: string;
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

interface ScanPath { path: string; parser?: ScanSource['parser']; }

export function detectSources(cwd = process.cwd(), platforms?: Record<string, boolean>): ScanSource[] {
  const home = homedir();
  const codex = getCodexHome();
  const enabled = (platform: string) => !platforms || platforms[platform] === true;
  const candidates: ScanSource[] = [];
  if (enabled('claude-code')) candidates.push({ tool: 'claude-code', parser: 'skill-md', paths: [join(home, '.claude', 'skills'), join(home, '.claude', 'commands'), join(cwd, '.claude', 'commands')] });
  if (enabled('cursor')) candidates.push({ tool: 'cursor', parser: 'cursorrules', paths: [join(cwd, '.cursorrules'), join(cwd, '.cursor', 'rules'), join(home, '.cursor', 'rules')] });
  if (enabled('windsurf')) candidates.push({ tool: 'windsurf', parser: 'markdown', paths: [join(cwd, '.windsurfrules'), join(home, '.windsurf', 'rules')] });
  if (enabled('cline')) candidates.push({ tool: 'cline', parser: 'markdown', paths: [join(cwd, '.clinerules'), join(home, '.cline', 'rules')] });
  if (enabled('codex')) candidates.push({ tool: 'custom', parser: 'skill-md', paths: [join(home, '.skillshub'), join(codex, 'skills'), join(codex, 'agents'), join(home, '.agents', 'skills')] });
  return candidates.map((source) => ({ ...source, paths: source.paths.map((path) => resolve(path)).filter(existsSync) })).filter((source) => source.paths.length > 0);
}

function isFile(path: string): boolean {
  try { return statSync(path).isFile(); } catch { return false; }
}

function isMcpConfigPath(path: string): boolean {
  return ['.mcp.json', 'config.toml', '.claude.json'].includes(basename(path));
}

function isPluginMarketplacePath(path: string): boolean {
  return basename(path) === 'marketplace.json' && path.includes('/plugins/');
}

function isRuleFile(path: string, parser?: ScanSource['parser']): boolean {
  if (['.cursorrules', '.windsurfrules', '.clinerules'].includes(basename(path))) return true;
  return (parser === 'cursorrules' || parser === 'markdown') && /\.mdc?$/i.test(path);
}

function isMetadataFile(path: string, parser?: ScanSource['parser']): boolean {
  return isMcpConfigPath(path)
    || isPluginMarketplacePath(path)
    || basename(path) === 'plugin.json'
    || basename(path) === 'SKILL.md'
    || (path.includes('/agents/') && (/\.md$/i.test(path) || /\.toml$/i.test(path)))
    || (path.includes('/commands/') && /\.md$/i.test(path))
    || isRuleFile(path, parser);
}

/** Bounded, metadata-only traversal. A SKILL.md marks a leaf and stops descent. */
function walkMetadataFiles(root: string, parser: ScanSource['parser'] | undefined, errors: string[]): string[] {
  const files: string[] = [];
  const visited = new Set<string>();
  let directories = 0;
  const visit = (path: string): void => {
    if (files.length >= MAX_FILES_PER_ROOT || directories >= MAX_DIRECTORIES_PER_ROOT) return;
    let real: string;
    try { real = realpathSync(path); } catch { return; }
    if (visited.has(real)) return;
    visited.add(real);
    directories++;
    const currentSkill = join(path, 'SKILL.md');
    if (isFile(currentSkill)) {
      files.push(currentSkill);
      return;
    }
    let entries;
    try { entries = readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); } catch (error) {
      errors.push(`Error scanning ${path}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (entries.length > MAX_ENTRIES_PER_DIRECTORY) {
      errors.push(`Stopped scanning ${path}: directory has more than ${MAX_ENTRIES_PER_DIRECTORY} entries`);
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES_PER_ROOT || directories >= MAX_DIRECTORIES_PER_ROOT) return;
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const child = join(path, entry.name);
      if (child.length > MAX_PATH_LENGTH) { errors.push(`Skipped overlong path: ${child}`); continue; }
      let stat;
      try { stat = statSync(child); } catch { continue; }
      if (stat.isDirectory()) {
        const skillPath = join(child, 'SKILL.md');
        if (existsSync(skillPath)) {
          files.push(skillPath);
          continue;
        }
        visit(child);
      } else if (stat.isFile() && isMetadataFile(child, parser)) {
        files.push(child);
      }
    }
  };
  visit(root);
  if (files.length >= MAX_FILES_PER_ROOT) errors.push(`Stopped scanning ${root} after ${MAX_FILES_PER_ROOT} metadata files`);
  if (directories >= MAX_DIRECTORIES_PER_ROOT) errors.push(`Stopped scanning ${root} after ${MAX_DIRECTORIES_PER_ROOT} directories`);
  return files;
}

function disabledPath(filePath: string): boolean {
  return filePath.includes('/skills-disabled/');
}

function parseRuleFile(filePath: string, content: string): RawCapability {
  const tool = filePath.includes('cursor') ? 'cursor' : filePath.includes('windsurf') ? 'windsurf' : filePath.includes('cline') ? 'cline' : 'custom';
  const name = basename(filePath).replace(/^\./, '').replace(/\.[^.]+$/, '') || `${tool}-rules`;
  const firstLine = content.split('\n').map((line) => line.trim()).find(Boolean);
  return { kind: 'skill', name: `${tool}-${name}`, description: firstLine?.slice(0, 180) || `${tool} local rule file`, origin: tool, filePath,
    triggers: [tool, name, `${tool} rules`], compatibility: tool === 'cursor' ? ['cursor'] : ['universal'], platform: tool === 'cursor' ? 'cursor' : 'universal', discovery: 'local-file' };
}

function parsed<T extends RawCapability>(value: T | null): T[] { return value ? [value] : []; }

function parseFile(filePath: string, content: string, parser?: ScanSource['parser']): RawCapability[] {
  if (isMcpConfigPath(filePath)) return parseMcpConfig(filePath, content);
  if (isPluginMarketplacePath(filePath)) return parsePluginMarketplace(filePath, content);
  if (basename(filePath) === 'plugin.json') return parsed(parsePluginManifest(filePath, content));
  if (basename(filePath) === 'SKILL.md') return parsed(parseSkill(filePath, content)).map((item) => ({ ...item, disabled: item.disabled || disabledPath(filePath) }));
  if (filePath.includes('/agents/') && filePath.endsWith('.toml')) return parsed(parseCodexAgentMetadata(filePath, content));
  if (filePath.includes('/agents/') && filePath.endsWith('.md')) return parsed(parseAgent(filePath, content)).map((item) => ({ ...item, disabled: item.disabled || disabledPath(filePath) }));
  if (filePath.includes('/commands/') && filePath.endsWith('.md')) return parsed(parseCommand(filePath, content)).map((item) => ({ ...item, disabled: item.disabled || disabledPath(filePath) }));
  return isRuleFile(filePath, parser) ? [parseRuleFile(filePath, content)] : [];
}

function isWithin(path: string, parent: string): boolean {
  const child = relative(parent, path);
  return child === '' || (!child.startsWith('..') && !isAbsolute(child));
}

function applySourcePlatform(capabilities: RawCapability[]): void {
  const codexHome = resolve(getCodexHome());
  for (const capability of capabilities) {
    if (!isWithin(resolve(capability.filePath), codexHome)) continue;
    capability.platform = 'codex';
    capability.compatibility = ['codex'];
  }
}

function assignTiers(capabilities: RawCapability[], platform?: Platform): void {
  if (!platform) return;
  for (const capability of capabilities) {
    capability.tier = capability.compatibility.includes(platform) ? 0 : capability.compatibility.includes('universal') ? 1 : 2;
  }
}

export function scan(options: ScanOptions = {}): ScanResult {
  const cwd = options.cwd ?? process.cwd();
  const platformSelection = options.platforms ?? (options.platform ? { [options.platform]: true } : undefined);
  const sources = options.sources ?? (options.includeDefaults === false ? [] : detectSources(cwd, platformSelection));
  const scanPaths: ScanPath[] = [
    ...(options.includeDefaults === false ? [] : getDefaultScanPaths(platformSelection, cwd).map((path) => ({ path }))),
    ...sources.flatMap((source) => source.paths.map((path) => ({ path, parser: source.parser }))),
    ...(options.extraPaths ?? []).map((path) => ({ path })),
  ];
  const roots = new Map<string, ScanPath>();
  for (const source of scanPaths) {
    const key = resolve(source.path);
    if (!roots.has(key) || source.parser) roots.set(key, source);
  }
  const capabilities: RawCapability[] = [];
  const errors: string[] = [];
  let scannedFiles = 0;

  for (const source of roots.values()) {
    if (!existsSync(source.path)) continue;
    const files = isFile(source.path) ? (isMetadataFile(source.path, source.parser) ? [source.path] : []) : walkMetadataFiles(source.path, source.parser, errors);
    for (const filePath of files) {
      if (filePath.length > MAX_PATH_LENGTH) { errors.push(`Skipped overlong path: ${filePath}`); continue; }
      let stat;
      try { stat = statSync(filePath); } catch { errors.push(`Metadata file disappeared: ${filePath}`); continue; }
      if (stat.size > MAX_METADATA_BYTES) { errors.push(`Skipped oversized metadata file: ${filePath}`); continue; }
      let content: string;
      try { content = readFileSync(filePath, 'utf-8'); } catch { errors.push(`Failed to read: ${filePath}`); continue; }
      scannedFiles++;
      capabilities.push(...parseFile(filePath, content, source.parser));
      options.onProgress?.(scannedFiles, capabilities.length);
    }
  }

  applySourcePlatform(capabilities);
  const deduplicated = dedup(capabilities);
  assignTiers(deduplicated, options.platform);
  return { capabilities: deduplicated, scannedFiles, scannedPaths: scanPaths.length, errors };
}
