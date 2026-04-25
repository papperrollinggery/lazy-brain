import { existsSync, openSync, readSync, closeSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { homedir } from 'node:os';
import { getClaudeConfigDir } from '../constants.js';

export type AgentScope = 'project' | 'user' | 'plugin';

export interface AgentInventoryEntry {
  name: string;
  description: string;
  scope: AgentScope;
  source: string;
  model?: string;
  tools: string[];
  available: boolean;
}

export interface AgentInventoryOptions {
  projectRoot?: string;
  claudeConfigDir?: string;
}

type RawAgent = Omit<AgentInventoryEntry, 'available'> & {
  priority: number;
  fileName: string;
};

const FRONTMATTER_READ_BYTES = 16 * 1024;

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function truncate(text: string, max = 320): string {
  const home = homedir().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const normalized = text
    .replace(new RegExp(home, 'g'), '~')
    .replace(/\/Users\/[^\s"'`]+/g, '~')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length > max ? normalized.slice(0, max - 1) + '…' : normalized;
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(Boolean);
  }
  if (typeof value !== 'string') return [];
  const raw = value.trim();
  if (!raw) return [];
  const stripped = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
  return stripped
    .split(',')
    .map(part => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function parseScalar(rawValue: string): unknown {
  const trimmed = rawValue.trim();
  if (!trimmed) return undefined;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return parseList(trimmed);
  }
  return trimmed;
}

function parseFrontmatterBlock(block: string): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {};
  for (const line of block.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    if (!key) continue;
    frontmatter[key] = parseScalar(line.slice(colonIndex + 1));
  }
  return frontmatter;
}

function readFrontmatterOnly(filePath: string): Record<string, unknown> {
  let fd: number | null = null;
  try {
    fd = openSync(filePath, 'r');
    const buffer = Buffer.alloc(FRONTMATTER_READ_BYTES);
    const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
    const text = buffer.subarray(0, bytesRead).toString('utf-8').replace(/\r\n/g, '\n');
    if (!text.startsWith('---\n')) return {};
    const endIndex = text.indexOf('\n---', 4);
    if (endIndex === -1) return {};
    return parseFrontmatterBlock(text.slice(4, endIndex));
  } catch {
    return {};
  } finally {
    if (fd !== null) {
      try { closeSync(fd); } catch {}
    }
  }
}

function listMarkdownFiles(root: string, maxDepth = 6): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git') continue;
      const full = join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full, depth + 1);
      } else if (stat.isFile() && full.endsWith('.md')) {
        files.push(full);
      }
    }
  };
  walk(root, 0);
  return files;
}

function pluginNameFromPath(filePath: string, claudeConfigDir: string): string {
  const rel = relative(join(claudeConfigDir, 'plugins'), filePath).replace(/\\/g, '/');
  const parts = rel.split('/').filter(Boolean);
  if (parts[0] === 'cache' && parts[1]) return parts[1];
  if (parts[0] === 'marketplaces') {
    const pluginIndex = parts.indexOf('plugins');
    if (pluginIndex >= 0 && parts[pluginIndex + 1]) return parts[pluginIndex + 1];
    if (parts[2]) return parts[2];
  }
  return parts[0] || 'plugin';
}

function isAgentMarkdown(filePath: string): boolean {
  return filePath.replace(/\\/g, '/').includes('/agents/') && filePath.endsWith('.md');
}

function toRawAgent(filePath: string, scope: AgentScope, source: string, priority: number): RawAgent | null {
  const fm = readFrontmatterOnly(filePath);
  const name = safeString(fm.name) ?? basename(filePath, '.md');
  const description = safeString(fm.description) ?? '';
  if (!name || !description) return null;
  const allowedTools = parseList(fm.tools).length > 0 ? parseList(fm.tools) : parseList(fm.allowedTools);
  const disallowedTools = parseList(fm.disallowedTools).map(tool => `!${tool}`);
  const tools = allowedTools.length > 0 ? allowedTools : disallowedTools;
  return {
    name,
    description: truncate(description),
    scope,
    source,
    model: safeString(fm.model),
    tools,
    priority,
    fileName: basename(filePath),
  };
}

export function scanAgentInventory(options: AgentInventoryOptions = {}): AgentInventoryEntry[] {
  const projectRoot = options.projectRoot ?? process.cwd();
  const claudeConfigDir = options.claudeConfigDir ?? getClaudeConfigDir();
  const rawAgents: RawAgent[] = [];

  const addAgents = (root: string, scope: AgentScope, source: string, priority: number, pluginRoot?: string) => {
    for (const file of listMarkdownFiles(root)) {
      if (pluginRoot && !isAgentMarkdown(file)) continue;
      const agentSource = pluginRoot ? `plugin:${pluginNameFromPath(file, claudeConfigDir)}` : source;
      const agent = toRawAgent(file, scope, agentSource, priority);
      if (agent) rawAgents.push(agent);
    }
  };

  addAgents(join(projectRoot, '.claude', 'agents'), 'project', 'project', 0);
  addAgents(join(claudeConfigDir, 'agents'), 'user', 'user', 1);
  addAgents(join(claudeConfigDir, 'plugins'), 'plugin', 'plugin', 2, join(claudeConfigDir, 'plugins'));

  rawAgents.sort((a, b) => {
    const nameCmp = normalizeName(a.name).localeCompare(normalizeName(b.name));
    if (nameCmp !== 0) return nameCmp;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.fileName.localeCompare(b.fileName);
  });

  const seen = new Set<string>();
  return rawAgents.map(({ priority: _priority, fileName: _fileName, ...agent }) => {
    const key = normalizeName(agent.name);
    const available = !seen.has(key);
    seen.add(key);
    return { ...agent, available };
  });
}
