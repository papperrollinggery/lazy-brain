export function simplifyUpstreamHud(text: string): string {
  return text
    .replace(/Tokens\s+([^\s(]+)\s*\([^)]*\)/g, '累计消耗 $1 tok')
    .replace(/tok:\s*([^\s(]+)\s*\([^)]*\)/g, '累计消耗 $1 tok');
}

// Always show LazyBrain in combined statusline so users can see active/dormant state
export function isLowSignalLazyBrainLabel(_label: string): boolean {
  return false;
}
