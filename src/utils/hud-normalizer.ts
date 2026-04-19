export function simplifyUpstreamHud(text: string): string {
  return text
    .replace(/Tokens\s+([^\s(]+)\s*\([^)]*\)/g, '累计消耗 $1 tok')
    .replace(/tok:\s*([^\s(]+)\s*\([^)]*\)/g, '累计消耗 $1 tok');
}

export function isLowSignalLazyBrainLabel(label: string): boolean {
  return /已跳过|待机中/.test(label);
}

