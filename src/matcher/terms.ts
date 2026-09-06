// Retrieval vocabulary only. The host model still decides whether a skill fits.
const STOP_WORDS = new Set((
  'a an the and or of to for in on with this that it me my your our i we you ' +
  'use using when should can please help find search local installed available ' +
  'skill skills tool tools plugin plugins agent agents capability capabilities ' +
  'user users asks asked want wants need needs how which what based through from ' +
  'hello hi thanks something task tasks handle improve check ' +
  '帮我 帮 找 找一下 搜索 查找 本地 已安装 工具 技能 适合 哪个 哪些 一个 这个 那个 ' +
  '一下 可以 能够 需要 使用 用 做 的 了 是 和 与 或 将 把 让 有 什么 怎么 我 我们 ' +
  '你好 您好 谢谢 处理 优化 检查 一些'
).split(/\s+/));

const CONCEPTS = [
  ['分镜', 'storyboard'], ['剧本', 'screenplay', 'script'],
  ['视频', 'video'], ['电影', 'cinematic', 'film'], ['图片', 'image'],
  ['生图', 'image', 'generation'], ['画面', 'visual'], ['表演', 'acting', 'performance'],
  ['音效', 'sound', 'audio'], ['配音', 'voiceover', 'speech'], ['剪辑', 'editing'],
  ['海报', 'poster'], ['提案', 'proposal'], ['演示', 'presentation', 'slides'],
  ['幻灯片', 'slides', 'presentation'], ['ppt', 'powerpoint', 'presentation'],
  ['网页', 'web', 'website', 'frontend'], ['网站', 'website', 'web', 'frontend'], ['作品集', 'portfolio'],
  ['设计', 'design'],
  ['品牌', 'brand'], ['图表', 'chart'], ['电子表格', 'spreadsheet'],
  ['调研', 'research'], ['研究', 'research'], ['简报', 'briefing'],
  ['自动化', 'automation'], ['排查', 'debug', 'diagnose'], ['测试', 'test'],
  ['代码', 'code'], ['安全', 'security'], ['发布', 'release'],
  ['去AI味', 'humanizer', 'writing'], ['去ai味', 'humanizer', 'writing'],
];

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });

function termKey(term: string): string {
  if (/^[a-z]{5,}ies$/.test(term)) return term.slice(0, -3) + 'y';
  if (/^[a-z]{4,}s$/.test(term) && !/(ss|us)$/.test(term)) return term.slice(0, -1);
  return term;
}

export function normalizeName(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function searchTerms(text: string, expand = false): Set<string> {
  const normalized = normalizeName(text);
  const terms = new Set<string>();
  for (const segment of segmenter.segment(normalized)) {
    if (segment.isWordLike && !STOP_WORDS.has(segment.segment) &&
      !/^\p{Script=Han}$/u.test(segment.segment) && !/^\d+$/u.test(segment.segment)) {
      terms.add(termKey(segment.segment));
    }
  }
  if (expand) {
    for (const group of CONCEPTS) {
      if (group.some((term) => terms.has(termKey(term)) || (/\p{Script=Han}/u.test(term) && normalized.includes(term.toLowerCase())))) {
        // Keep compound concepts equivalent across languages, rather than giving
        // Chinese metadata extra weight for each character of e.g. 自动化.
        for (const term of group.filter((value) => /\p{Script=Han}/u.test(value))) {
          for (const segment of segmenter.segment(term.toLowerCase())) {
            if (segment.segment !== term.toLowerCase()) terms.delete(segment.segment);
          }
        }
        for (const term of group) terms.delete(termKey(term.toLowerCase()));
        const canonical = group.find((term) => /^[a-z]+$/.test(term)) ?? group[0];
        terms.add(termKey(canonical));
      }
    }
  }
  return terms;
}

export function positiveSearchText(query: string): string {
  return query.replace(/(?:不要|不需要|无需|别|不生成)[^，。；,;.!?]*/gu, ' ')
    .replace(/\b(?:without|do not|don't)\b[^,;.!?]*/giu, ' ').trim();
}
