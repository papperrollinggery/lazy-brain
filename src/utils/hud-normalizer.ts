export function simplifyUpstreamHud(text: string): string {
  return text
    .replace(/Tokens\s+([^\s(]+)\s*\([^)]*\)/g, '累计消耗 $1 tok')
    .replace(/tok:\s*([^\s(]+)\s*\([^)]*\)/g, '累计消耗 $1 tok');
}

export function isLowSignalLazyBrainLabel(label: string): boolean {
  const clean = label.replace(/\x1b\[[0-9;]*m/g, '').trim();
  return clean.includes('待机中') || clean.includes('上次') || clean.includes('已跳过');
}
