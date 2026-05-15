export interface BoxOptions {
  title?: string;
  padding?: number;
  width?: number;
}

const RESET = '\u001b[0m';

function colorsEnabled(): boolean {
  return process.env.NO_COLOR === undefined && process.env.TERM !== 'dumb';
}

function paint(text: string, code: string): string {
  return colorsEnabled() ? `${code}${text}${RESET}` : text;
}

export function bold(text: string): string {
  return paint(text, '\u001b[1m');
}

export function dim(text: string): string {
  return paint(text, '\u001b[2m');
}

export function green(text: string): string {
  return paint(text, '\u001b[32m');
}

export function yellow(text: string): string {
  return paint(text, '\u001b[33m');
}

export function cyan(text: string): string {
  return paint(text, '\u001b[36m');
}

export function highlight(text: string): string {
  return cyan(bold(text));
}

function visibleLength(text: string): number {
  return text.replace(/\u001b\[[0-9;]*m/g, '').length;
}

function terminalWidth(): number {
  const columns = process.stdout.columns;
  return Math.max(40, Math.min(96, columns || 80));
}

function cropVisible(text: string, width: number): string {
  if (visibleLength(text) <= width) return text;
  const plain = text.replace(/\u001b\[[0-9;]*m/g, '');
  return `${plain.slice(0, Math.max(0, width - 1))}…`;
}

function padLine(text: string, width: number): string {
  const clipped = cropVisible(text, width);
  return `${clipped}${' '.repeat(Math.max(0, width - visibleLength(clipped)))}`;
}

function wrapPlain(text: string, width: number): string[] {
  if (!text) return [''];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word.length > width ? word.slice(0, width) : word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

export function box(content: string[], options: BoxOptions = {}): string {
  const padding = options.padding ?? 1;
  const outerWidth = Math.min(options.width ?? terminalWidth(), terminalWidth());
  const innerWidth = Math.max(20, outerWidth - 2 - (padding * 2));
  const horizontal = '─'.repeat(innerWidth + padding * 2);
  const lines: string[] = [`╭${horizontal}╮`];
  if (options.title) {
    lines.push(`│${' '.repeat(padding)}${padLine(bold(options.title), innerWidth)}${' '.repeat(padding)}│`);
    lines.push(`│${' '.repeat(innerWidth + padding * 2)}│`);
  }
  for (const raw of content) {
    const wrapped = raw.includes('\u001b[') ? [raw] : wrapPlain(raw, innerWidth);
    for (const line of wrapped) {
      lines.push(`│${' '.repeat(padding)}${padLine(line, innerWidth)}${' '.repeat(padding)}│`);
    }
  }
  lines.push(`╰${horizontal}╯`);
  return lines.join('\n');
}

export function progressBar(value: number, max: number, width = 18): string {
  const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  const filled = Math.round(ratio * width);
  return `${green('█'.repeat(filled))}${dim('░'.repeat(width - filled))}`;
}
