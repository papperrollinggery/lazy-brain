const META_PROMPT_PATTERNS = [
  /^不要继续/i,
  /^只输出/i,
  /^只汇报/i,
  /^停止扩/i,
  /^当前优先级/i,
  /^先不继续做/i,
  /^请现在不要继续/i,
  /^验收说明/i,
  /^测试结果/i,
  /^改了哪些/i,
  /^汇报$/i,
  /^继续 Phase/i,
  /^严格遵守/i,
  /^目标[：:]/i,
  /^目标是/i,
  /^要求[：:]/i,
];

export function isMetaPrompt(prompt: string): boolean {
  const value = prompt.trim();
  return META_PROMPT_PATTERNS.some(pattern => pattern.test(value));
}

