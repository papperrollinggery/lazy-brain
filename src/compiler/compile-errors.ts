export interface CompileErrorSummary {
  total: number;
  byCode: Record<string, number>;
}

export function classifyCompileError(error: string): string {
  const match = /^([a-z0-9_]+):/i.exec(error.trim());
  return match?.[1] ?? 'unknown';
}

export function summarizeCompileErrors(errors: string[]): CompileErrorSummary {
  const byCode: Record<string, number> = {};
  for (const error of errors) {
    const code = classifyCompileError(error);
    byCode[code] = (byCode[code] ?? 0) + 1;
  }
  return { total: errors.length, byCode };
}

export function formatCompileErrorReport(errors: string[], limit = 20): string {
  if (errors.length === 0) return 'No persisted compile errors.';

  const summary = summarizeCompileErrors(errors);
  const lines = [
    `Persisted compile errors: ${summary.total}`,
    '',
    'By type:',
  ];
  for (const [code, count] of Object.entries(summary.byCode).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    lines.push(`  - ${code}: ${count}`);
  }

  lines.push('', `First ${Math.min(limit, errors.length)} errors:`);
  for (const error of errors.slice(0, limit)) {
    lines.push(`  - ${error}`);
  }
  if (errors.length > limit) lines.push(`  ... ${errors.length - limit} more`);

  return lines.join('\n');
}
