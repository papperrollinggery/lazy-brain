/**
 * Query normalization and intent expansion.
 *
 * This is deliberately query-side only: it improves matching without requiring
 * users to recompile the capability graph. The goal is to handle mixed
 * Simplified/Traditional Chinese, English aliases, and abstract phrasing.
 */

const TRAD_TO_SIMP: Record<string, string> = {
  '審': '审', '查': '查', '碼': '码', '測': '测', '試': '试', '單': '单',
  '開': '开', '發': '发', '構': '构', '劃': '划', '畫': '画', '設': '设',
  '計': '计', '檢': '检', '遷': '迁', '優': '优', '資': '资', '料': '料',
  '庫': '库', '專': '专', '項': '项', '復': '复', '雜': '杂',
  '體': '体', '統': '统', '運': '运', '維': '维', '錯': '错', '誤': '误',
  '權': '权', '限': '限', '認': '认', '證': '证', '鑑': '鉴', '別': '别',
  '對': '对', '雙': '双', '語': '语', '言': '言', '產': '产', '品': '品',
  '寫': '写', '啟': '启', '動': '动', '態': '态', '觀': '观', '顯': '显',
  '幫': '帮', '麼': '么', '為': '为', '與': '与', '這': '这',
  '個': '个', '裡': '里', '裏': '里', '長': '长', '級': '级', '現': '现',
};

const PHRASE_NORMALIZATIONS: Array<[RegExp, string]> = [
  [/程式碼/g, '代码'],
  [/代碼/g, '代码'],
  [/軟體/g, '软件'],
  [/資料庫/g, '数据库'],
  [/測試/g, '测试'],
  [/單元/g, '单元'],
  [/整合測試/g, '集成测试'],
  [/端對端/g, '端到端'],
  [/專案/g, '项目'],
  [/項目/g, '项目'],
  [/規劃/g, '规划'],
  [/架構/g, '架构'],
  [/設計/g, '设计'],
  [/遷移/g, '迁移'],
  [/效能/g, '性能'],
  [/最佳實踐/g, '最佳实践'],
  [/開發/g, '开发'],
  [/部署/g, '部署'],
  [/發佈/g, '发布'],
  [/釋出/g, '发布'],
  [/審查/g, '审查'],
  [/審核/g, '审核'],
  [/偵錯/g, '调试'],
  [/除錯/g, '调试'],
];

const ABSTRACT_EXPANSIONS: Array<[RegExp, string[]]> = [
  [/(带不起来|帶不起来|帶不起來|兜圈子|没思路|沒有思路|卡住|混乱|混亂|不知道怎么做|不知道怎麼做)/i,
    ['架构', '规划', '拆解', '方案', 'architecture', 'architect', 'planning', 'plan']],
  [/(这个东西有用吗|這個東西有用嗎|没什么用|沒什麼用|不可感知|看不见价值|看不見價值|产品感|產品感)/i,
    ['产品', '定位', '用户价值', '体验', 'product', 'strategy', 'ux']],
  [/(怎么发布|怎麼發布|如何公布|上线|上線|公开|公開|推广|推廣|变现|變現|商业化|商業化)/i,
    ['发布', '部署', '文档', '营销', '定价', 'release', 'go-to-market', 'monetization']],
  [/(预算|預算|太贵|太貴|省钱|省錢|成本|烧钱|燒錢|额度|額度)/i,
    ['预算', '成本', '模型路由', '优化', 'budget', 'cost', 'routing']],
  [/(不清晰|不直观|不直觀|展示|显示|顯示|界面|介面|hud|ui|桌面宠物|桌面寵物)/i,
    ['界面', '可视化', '状态栏', '设计', 'frontend', 'ui', 'hud']],
  [/(质量差|品質差|代码烂|代碼爛|垃圾代码|垃圾代碼|ai slop|slop|生成得很乱|生成得很亂)/i,
    ['ai-slop-cleaner', 'slop', 'ai-generated-code', 'code-cleanup', 'code-maintenance']],
  [/(新人上手|入门|入門|看不懂|解释代码库|解釋代碼庫|介绍工程|介紹工程)/i,
    ['代码库', '文档', '导览', 'onboarding', 'code-tour', 'documentation', 'codebase', 'tour']],
  [/(系统架构|系統架構|架构设计|架構設計|设计系统架构|設計系統架構)/i,
    ['架构', '设计', '规划', 'architecture', 'architect', 'system-design', 'planner', 'backend-architect']],
  [/(部署到生产环境|部署到生產環境|上线生产|上線生產|发布到生产|發佈到生產)/i,
    ['部署', '生产', '发布', '验证', 'deployment', 'production', 'verification', 'verify', 'setup', 'verification-loop']],
  [/(docker 配置|docker配置|写 docker 配置|寫 docker 配置|容器配置)/i,
    ['docker', '配置', 'container', 'configure', 'devops', 'backend-patterns']],
  [/(数据库迁移|資料庫遷移|迁移数据库|遷移資料庫)/i,
    ['数据库', '迁移', 'database', 'migration', 'migrate', 'backend-patterns', 'database-optimizer']],
  [/(技术文章|技術文章|技术博客|技術博客|写技术文章|寫技術文章)/i,
    ['技术', '文章', 'technical', 'article', 'blog', 'writer', 'writing', 'article-writing', 'technical-writer']],
  [/(go 语言开发|go语言开发|golang 开发|golang开发)/i,
    ['go', 'golang', '开发', 'backend', 'patterns', 'go-build', 'go-review']],
  [/(spring boot 开发|springboot 开发|spring boot)/i,
    ['spring', 'springboot', 'backend', 'java', 'development', 'backend-patterns', 'debugger']],
  [/(修个 typo|修 typo|改个 typo|小修一下|修个错字|修个筆誤)/i,
    ['typo', 'small-fix', 'minimal-change', 'fix', 'build-fix']],
  [/(对抗性双模型审查|對抗性雙模型審查|双模型审查|雙模型審查)/i,
    ['adversarial', 'dual-review', 'critic', 'code-reviewer', 'santa-loop']],
  [/(ralph.*bug|ralph.*错误|ralph.*錯誤|ralph.*问题|ralph.*問題)/i,
    ['ralph', 'debugger', 'agent-introspection-debugging']],
  [/(出错|出錯|报错|報錯|失败|失敗|坏了|壞了|不工作|不能运行|不能執行)/i,
    ['调试', '修复', 'bug', 'debug', 'fix', 'investigate']],
];

function normalizeTraditionalChinese(input: string): string {
  let output = input;
  for (const [pattern, replacement] of PHRASE_NORMALIZATIONS) {
    output = output.replace(pattern, replacement);
  }
  return [...output].map(ch => TRAD_TO_SIMP[ch] ?? ch).join('');
}

export function normalizeQuery(query: string): string {
  return normalizeTraditionalChinese(query).normalize('NFKC');
}

export function expandAbstractQuery(query: string): string[] {
  const normalized = normalizeQuery(query);
  const additions = new Set<string>();

  for (const [pattern, terms] of ABSTRACT_EXPANSIONS) {
    if (pattern.test(normalized) || pattern.test(query)) {
      for (const term of terms) additions.add(term);
    }
  }

  return [...additions];
}

export function enrichQueryForMatching(query: string): string {
  const normalized = normalizeQuery(query);
  const expansions = expandAbstractQuery(normalized);
  if (expansions.length === 0) return normalized;
  return `${normalized} ${expansions.join(' ')}`;
}

export function isIntentExpansionToken(token: string, query: string): boolean {
  return expandAbstractQuery(query).some(expanded => expanded.toLowerCase() === token.toLowerCase());
}
