/**
 * LazyBrain — Thinking Trigger Matcher
 *
 * Detects when a user's query would benefit from thinking/socratic tools
 * rather than immediate direct answers.
 */

const CODE_EXTENSIONS = ['.ts', '.py', '.js', '.jsx', '.md', '.go', '.java', '.rb', '.rs', '.cpp', '.c', '.h'];
const TECH_STACK_KEYWORDS = [
  'python', 'javascript', 'typescript', 'java', 'go', 'golang', 'rust',
  'ruby', 'php', 'scala', 'kotlin', 'swift', 'c++', 'c#',
  'react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt', 'flutter',
  'django', 'flask', 'fastapi', 'spring', 'springboot', 'rails', 'laravel',
  'docker', 'kubernetes', 'terraform',
  'postgres', 'mysql', 'mongodb', 'redis', 'clickhouse',
  'webpack', 'vite', 'gradle', 'maven',
];
const CODE_PATTERNS = [
  /\w+\s*\(\s*\)/,
  /[A-Z][a-zA-Z0-9]+\s*\(/,
  /function\s+\w+/,
  /class\s+\w+/,
  /const\s+\w+\s*=/,
  /let\s+\w+\s*=/,
  /var\s+\w+\s*=/,
  /=>\s*{/,
];

const CHOICE_PATTERNS = [
  /还是\s/,
  /A\s+还是\s+B/i,
  /选哪个/,
  /\bor\b/i,
  /是.*还是/,
];

const OPEN_ENDED_PREFIX_SUFFIX = [
  /^怎么看/,
  /怎么看\??$/,
  /^觉得/,
  /觉得.*怎么样/,
  /觉得\??$/,
  /^为什么/,
  /为什么\??$/,
  /^如何评价/,
  /如何评价\??$/,
  /\?+$/,
];

const INTENT_PATTERNS = [
  /想做一个/,
  /打算实现/,
  /要构建/,
  /想做一个/,
  /打算做一个/,
];

export interface ThinkingHint {
  triggered: boolean;
  reason: string;
  suggestedSkills: Array<{
    name: string;
    why: string;
  }>;
}

function hasCodeReference(query: string): boolean {
  const lower = query.toLowerCase();
  if (CODE_EXTENSIONS.some(ext => lower.includes(ext))) return true;
  if (CODE_PATTERNS.some(p => p.test(query))) return true;
  if (TECH_STACK_KEYWORDS.some(kw => lower.includes(kw))) return true;
  return false;
}

function matchChoice(query: string): boolean {
  return CHOICE_PATTERNS.some(p => p.test(query));
}

function matchOpenEnded(query: string): boolean {
  return OPEN_ENDED_PREFIX_SUFFIX.some(p => p.test(query.trim()));
}

function matchIntent(query: string): boolean {
  return INTENT_PATTERNS.some(p => p.test(query));
}

export function detectThinkingNeed(query: string): ThinkingHint {
  const trimmed = query.trim();

  // Rule 1: Long + no code reference → deep-interview
  const cjkLen = (s: string): number => {
    let len = 0;
    for (const c of s) {
      const cp = c.codePointAt(0) ?? 0;
      len += (cp >= 0x1100 && cp <= 0x115F) ||
             (cp >= 0x2E80 && cp <= 0x303E) ||
             (cp >= 0x3040 && cp <= 0xA4CF) ||
             (cp >= 0xAC00 && cp <= 0xD7AF) ||
             (cp >= 0xF900 && cp <= 0xFAFF) ||
             (cp >= 0xFE10 && cp <= 0xFE1F) ||
             (cp >= 0xFE30 && cp <= 0xFE4F) ||
             (cp >= 0xFF00 && cp <= 0xFF60) ||
             (cp >= 0xFFE0 && cp <= 0xFFE6) ? 2 : 1;
    }
    return len;
  };

  if (cjkLen(trimmed) > 80 && !hasCodeReference(trimmed)) {
    return {
      triggered: true,
      reason: '你的问题较长且没有具体代码引用，看起来需要先理清思路而不是直接实现。',
      suggestedSkills: [
        { name: 'deep-interview', why: '通过提问帮你澄清需求、分解问题，避免过早进入实现' },
        { name: 'analyst', why: '帮你分析问题的多个维度，找到最佳切入点' },
      ],
    };
  }

  // Rule 2: Choice question → ralplan
  if (matchChoice(trimmed)) {
    return {
      triggered: true,
      reason: '你在 A 和 B 之间犹豫，这是一个需要权衡决策的场景。',
      suggestedSkills: [
        { name: 'ralplan', why: '帮你列出选项、评估利弊，做出理性选择' },
        { name: 'critic', why: '从反对角度审视每个选项的潜在问题' },
      ],
    };
  }

  // Rule 3: Open-ended question → critic
  if (matchOpenEnded(trimmed)) {
    return {
      triggered: true,
      reason: '这是一个开放性评价问题，需要多角度审视而不是简单回答。',
      suggestedSkills: [
        { name: 'critic', why: '帮你找到这个方案/想法的潜在问题和改进空间' },
        { name: 'council', why: '汇聚多方意见，帮你形成更全面的判断' },
      ],
    };
  }

  // Rule 4: Intent without tech stack → deep-interview
  if (matchIntent(trimmed) && !hasCodeReference(trimmed)) {
    return {
      triggered: true,
      reason: '你描述了一个目标但没有具体技术方案，需要先明确实现路径。',
      suggestedSkills: [
        { name: 'deep-interview', why: '帮你梳理需求细节，确定技术选型和实现顺序' },
        { name: 'planner', why: '帮你制定具体的执行计划和里程碑' },
      ],
    };
  }

  return {
    triggered: false,
    reason: '',
    suggestedSkills: [],
  };
}
