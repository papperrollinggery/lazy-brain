import { parseDocument } from 'yaml';

interface FrontmatterResult {
  frontmatter: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(content: string): FrontmatterResult {
  const match = content.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  const body = content.slice(match[0].length);
  try {
    const document = parseDocument(match[1], { prettyErrors: false, uniqueKeys: true });
    if (document.errors.length > 0) return { frontmatter: {}, body };
    const value = document.toJS();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { frontmatter: {}, body };
    return { frontmatter: value as Record<string, unknown>, body };
  } catch {
    return { frontmatter: {}, body };
  }
}
