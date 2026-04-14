/**
 * LazyBrain — YAML Frontmatter Parser
 *
 * Parses simple YAML frontmatter from Markdown files.
 * Only handles: key-value pairs, quoted strings, booleans, numbers.
 */

interface FrontmatterResult {
  frontmatter: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(content: string): FrontmatterResult {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { frontmatter: {}, body: content };
  }

  const lines = content.split('\n');
  if (lines[0] !== '---') {
    return { frontmatter: {}, body: content };
  }

  const endIndex = lines.indexOf('---', 1);
  if (endIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  const yamlLines = lines.slice(1, endIndex);
  const frontmatter: Record<string, unknown> = {};

  for (const line of yamlLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const rawValue = line.slice(colonIndex + 1).trim();

    if (rawValue === '') {
      frontmatter[key] = undefined;
      continue;
    }

    if (rawValue === 'true') {
      frontmatter[key] = true;
    } else if (rawValue === 'false') {
      frontmatter[key] = false;
    } else if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
      frontmatter[key] = Number(rawValue);
    } else if ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
               (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
      frontmatter[key] = rawValue.slice(1, -1);
    } else {
      frontmatter[key] = rawValue;
    }
  }

  const bodyLines = lines.slice(endIndex + 1);
  return {
    frontmatter,
    body: bodyLines.join('\n'),
  };
}
