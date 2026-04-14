/**
 * LazyBrain — Wiki Generator
 *
 * Generates wiki articles from the knowledge graph.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Graph } from './graph.js';
import { WIKI_DIR } from '../constants.js';

export interface WikiOptions {
  outputDir?: string;
}

export interface WikiResult {
  articlesWritten: number;
  indexPath: string;
}

const CATEGORY_TITLES: Record<string, string> = {
  'code-quality': 'Code Quality',
  'testing': 'Testing',
  'development': 'Development',
  'deployment': 'Deployment',
  'design': 'Design',
  'planning': 'Planning',
  'research': 'Research',
  'operations': 'Operations',
  'security': 'Security',
  'content': 'Content Creation',
  'data': 'Data',
  'orchestration': 'Orchestration',
  'learning': 'Learning',
  'communication': 'Communication',
  'other': 'Other',
};

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function getRelatedLinks(graph: Graph, nodeId: string): Array<{ name: string; type: string }> {
  const links = graph.getLinks(nodeId);
  const related: Array<{ name: string; type: string }> = [];

  for (const link of links) {
    const targetNode = graph.getNode(link.target);
    if (targetNode) {
      related.push({ name: targetNode.name, type: link.type });
    }
  }

  return related;
}

function formatRelated(related: Array<{ name: string; type: string }>): string {
  if (related.length === 0) return '';

  const parts: string[] = [];
  for (const rel of related.slice(0, 5)) {
    parts.push(`[[${rel.name}]] (${rel.type})`);
  }

  return `\n  Related: ${parts.join(', ')}`;
}

function generateCategoryArticle(
  graph: Graph,
  category: string,
): string {
  const nodes = graph.getByCategory(category);
  const title = CATEGORY_TITLES[category] || category.charAt(0).toUpperCase() + category.slice(1);

  const skills = nodes.filter(n => n.kind === 'skill');
  const agents = nodes.filter(n => n.kind === 'agent');
  const commands = nodes.filter(n => n.kind === 'command');
  const others = nodes.filter(n => !['skill', 'agent', 'command'].includes(n.kind));

  const lines: string[] = [
    `# ${title}`,
    '',
    `> ${nodes.length} capabilities`,
    '',
  ];

  if (skills.length > 0) {
    lines.push('## Skills', '');
    for (const cap of skills) {
      const related = getRelatedLinks(graph, cap.id);
      lines.push(`- **${cap.name}** — ${cap.description} [${cap.origin}]`);
      if (cap.tags.length > 0) {
        lines.push(`  Tags: ${cap.tags.join(', ')}`);
      }
      const formattedRelated = formatRelated(related);
      if (formattedRelated) {
        lines.push(formattedRelated);
      }
      lines.push('');
    }
  }

  if (agents.length > 0) {
    lines.push('## Agents', '');
    for (const cap of agents) {
      const related = getRelatedLinks(graph, cap.id);
      lines.push(`- **${cap.name}** — ${cap.description} [${cap.origin}]`);
      const formattedRelated = formatRelated(related);
      if (formattedRelated) {
        lines.push(formattedRelated);
      }
      lines.push('');
    }
  }

  if (commands.length > 0) {
    lines.push('## Commands', '');
    for (const cap of commands) {
      const related = getRelatedLinks(graph, cap.id);
      lines.push(`- **${cap.name}** — ${cap.description} [${cap.origin}]`);
      const formattedRelated = formatRelated(related);
      if (formattedRelated) {
        lines.push(formattedRelated);
      }
      lines.push('');
    }
  }

  if (others.length > 0) {
    lines.push('## Other', '');
    for (const cap of others) {
      lines.push(`- **${cap.name}** — ${cap.description} [${cap.origin}]`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function generateIndex(
  graph: Graph,
  categories: string[],
): string {
  const categoryStats = categories.map(cat => ({
    name: cat,
    title: CATEGORY_TITLES[cat] || cat,
    count: graph.getByCategory(cat).length,
  }));

  const lines: string[] = [
    '# LazyBrain Wiki',
    '',
    `> ${graph.getNodeCount()} capabilities across ${categories.length} categories`,
    '',
    '## Categories',
    '',
  ];

  for (const cat of categoryStats) {
    if (cat.count > 0) {
      lines.push(`- [${cat.title}](${cat.name}.md) — ${cat.count} capabilities`);
    }
  }

  return lines.join('\n');
}

export function generateWiki(graph: Graph, options?: WikiOptions): WikiResult {
  const outputDir = options?.outputDir ?? WIKI_DIR;
  ensureDir(outputDir);

  const allNodes = graph.getAllNodes();
  const categories = [...new Set(allNodes.map(n => n.category))].sort();

  let articlesWritten = 0;

  for (const category of categories) {
    const article = generateCategoryArticle(graph, category);
    const filePath = join(outputDir, `${category}.md`);
    writeFileSync(filePath, article, 'utf-8');
    articlesWritten++;
  }

  const indexContent = generateIndex(graph, categories);
  const indexPath = join(outputDir, 'index.md');
  writeFileSync(indexPath, indexContent, 'utf-8');
  articlesWritten++;

  return { articlesWritten, indexPath };
}
