import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function fail(message) {
  failures.push(message);
}

function json(relativePath) {
  try {
    return JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
  } catch (error) {
    fail(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`);
}

const pkg = json('package.json');
const manifest = json('.codex-plugin/plugin.json');
const mcp = json('.mcp.json');
const marketplace = json('.agents/plugins/marketplace.json');

for (const key of ['name', 'version', 'description', 'homepage', 'repository', 'license']) {
  requireString(manifest[key], `.codex-plugin/plugin.json#${key}`);
}
if (manifest.name !== pkg.name) fail('plugin name must match package name');
if (manifest.version !== pkg.version) fail('plugin version must match package version');
if (manifest.license !== pkg.license) fail('plugin license must match package license');

for (const field of ['skills', 'mcpServers']) {
  const value = manifest[field];
  requireString(value, `.codex-plugin/plugin.json#${field}`);
  if (typeof value === 'string' && (!value.startsWith('./') || !existsSync(join(root, value)))) {
    fail(`plugin ${field} must reference an existing relative path`);
  }
}

const server = mcp?.mcpServers?.lazybrain;
if (!server || typeof server !== 'object') fail('.mcp.json must define mcpServers.lazybrain');
if (server?.command !== 'node' || server?.cwd !== '.') {
  fail('lazybrain MCP must launch node in its own plugin directory');
}
if (JSON.stringify(server?.args) !== JSON.stringify(['./dist/bin/mcp.js'])) {
  fail('lazybrain MCP must launch the bundled ./dist/bin/mcp.js');
}
if (!existsSync(join(root, 'dist/bin/mcp.js'))) fail('build the bundled MCP server before validating');

if (marketplace.name !== 'lazybrain-local') fail('marketplace name must be lazybrain-local');
const entry = Array.isArray(marketplace.plugins) ? marketplace.plugins.find((item) => item?.name === manifest.name) : undefined;
if (!entry) fail('marketplace must list the plugin manifest name');
if (entry?.source?.source !== 'local' || entry?.source?.path !== './') {
  fail('marketplace plugin source must be the local repository root');
}

const skillPath = join(root, 'skills/lazybrain-find/SKILL.md');
const skill = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';
if (!/^---\n[\s\S]*?\n---\n/.test(skill)) fail('Skill must contain YAML frontmatter');
if (!/^name:\s*lazybrain-find\s*$/m.test(skill)) fail('Skill frontmatter name must be lazybrain-find');
if (!/^description:\s*\S.+$/m.test(skill)) fail('Skill frontmatter must contain a description');

const agentPath = join(root, 'skills/lazybrain-find/agents/openai.yaml');
const agent = existsSync(agentPath) ? readFileSync(agentPath, 'utf8') : '';
for (const key of ['display_name', 'short_description', 'default_prompt']) {
  if (!new RegExp(`^\\s*${key}:\\s*\\S.+$`, 'm').test(agent)) fail(`agents/openai.yaml must contain ${key}`);
}
if (!agent.includes('$lazybrain-find')) fail('agents/openai.yaml default prompt must reference $lazybrain-find');

if (failures.length) {
  failures.forEach((message) => console.error(`Plugin validation failed: ${message}`));
  process.exit(1);
}

console.log(`Codex plugin and Skill validation passed for ${manifest.name}@${manifest.version}`);
