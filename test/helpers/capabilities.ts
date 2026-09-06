import { Graph } from '../../src/graph/graph.js';
import type { Capability } from '../../src/types.js';

export function localCapability(name: string, description: string, extra: Partial<Capability> = {}): Capability {
  return {
    id: name, name, description, kind: 'skill', origin: 'local',
    status: 'installed', discovery: 'local-file', compatibility: ['codex'],
    filePath: '/fixture/skills/' + name + '/SKILL.md',
    tags: [], exampleQueries: [], category: 'local', ...extra,
  };
}

export function workflowGraph(): Graph {
  const graph = new Graph();
  for (const [name, description] of [
    ['convert-script-to-seedance', '将中文剧本转换为 Seedance 分镜提示词，规划人物、场景与道具参考资产。'],
    ['seedance-emotion', 'Seedance video prompts for emotional acting and character performance.'],
    ['video-evidence-workbench', '分析本地视频、广告和参考片，完成可追溯的镜头与声音拆解、分帧与复核导出。'],
    ['presentations', 'Create and edit PowerPoint presentations and client proposal slide decks.'],
    ['frontend-design', 'Design websites, personal portfolios, web pages and frontend interfaces.'],
    ['codex-native-automation-ops', 'Inspect and update Codex automations, audit scheduled runs and troubleshoot automation configuration.'],
    ['agent-development', 'Create an agent, edit agent frontmatter, or write agent instructions for plugins.'],
    ['portfolio-risk-management', 'Assess financial portfolio risk, stocks, investments and exposure.'],
    ['security-review', 'Review code for authentication vulnerabilities and security bugs.'],
    ['video-generation', 'Generate new AI video footage from text prompts.'],
  ]) graph.addNode(localCapability(name, description));
  return graph;
}
