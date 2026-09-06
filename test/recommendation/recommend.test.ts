import { describe, expect, test } from 'vitest';
import { Graph } from '../../src/graph/graph.js';
import { find, match } from '../../src/matcher/matcher.js';
import { formatDecisionMarkdown, recommend } from '../../src/recommendation/recommend.js';
import { localCapability, workflowGraph } from '../helpers/capabilities.js';

describe('source-aware local recommendations', () => {
  test.each([
    ['中文剧本转成Seedance分镜提示词', 'convert-script-to-seedance'],
    ['把本地视频逐镜头分析后导出证据', 'video-evidence-workbench'],
    ['客户提案PPT演示文稿', 'presentations'],
    ['设计个人作品集网站', 'frontend-design'],
    ['检查Codex自动化', 'codex-native-automation-ops'],
  ])('finds a relevant entry for %s', (query, expected) => {
    const result = recommend(query, { graph: workflowGraph(), platform: 'codex' });
    expect(result.primary?.name).toBe(expected);
    expect(result.primary?.filePath).toBe('/fixture/skills/' + expected + '/SKILL.md');
    expect(result.primary?.callableVerified).toBe(false);
    expect(result.workflow).toEqual([]);
  });

  test('empty local catalogs do not invent installed built-ins', () => {
    const result = recommend('review code for security', { graph: new Graph() });
    expect(result.action).toBe('no_match');
    expect(result.primary).toBeNull();
    expect(result.clarifyingQuestion).toBeUndefined();
    expect(find('security-review')).toEqual([]);
    expect(find('security-review', { includeBuiltins: true })[0]?.capability)
      .toMatchObject({ status: 'available', discovery: 'builtin-example' });
  });

  test.each(['help me with this', '你好，帮我处理一下', 'find a skill please'])('does not route generic filler: %s', (query) => {
    const result = recommend(query, { graph: workflowGraph() });
    expect(result.action).toBe('clarify');
    expect(result.primary).toBeNull();
  });

  test('a shared Chinese character is not an intent match', () => {
    const graph = new Graph();
    graph.addNode(localCapability('visual-review', '检查色彩、亮度与深度'));
    expect(recommend('查查我的额度还剩多少', { graph }).action).toBe('no_match');
  });

  test('retains a local entry even if a demo recipe shares its name', async () => {
    const graph = new Graph();
    const real = localCapability('security-review', 'Specialized local audit for payment schemas.', {
      origin: 'team', kind: 'command', id: 'team-command', triggers: ['payment schemas'],
    });
    graph.addNode(real);
    const found = find('payment schemas', { graph, includeBuiltins: true })[0];
    expect(found.capability).toBe(real);
    expect((await match('payment schemas', { graph, config: {} })).matches[0]?.capability).toBe(real);
  });

  test('filters platform and disabled entries before applying the result limit', () => {
    const graph = new Graph();
    for (let i = 0; i < 8; i++) graph.addNode(localCapability('render-' + i, 'Render animation.', {
      id: 'foreign-' + i, compatibility: ['claude-code'], triggers: ['render animation'],
    }));
    graph.addNode(localCapability('disabled-render', 'Render animation.', { status: 'disabled' }));
    graph.addNode(localCapability('codex-render', 'Render animation.'));
    const results = find('render animation', { graph, platform: 'codex', limit: 1 });
    expect(results.map((item) => item.skill)).toEqual(['codex-render']);
  });

  test('preserves kind and all source identities for same-named capabilities', () => {
    const graph = new Graph();
    graph.addNode(localCapability('figma', 'Figma design inspection', { id: 's1', origin: 'team-a' }));
    graph.addNode(localCapability('figma', 'Figma design inspection', { id: 's2', origin: 'team-b', filePath: '/fixture/team-b/SKILL.md' }));
    graph.addNode(localCapability('figma', 'Figma design inspection', { id: 'm1', kind: 'mcp', discovery: 'configured' }));
    const result = recommend('figma', { graph });
    const candidates = [result.primary, ...result.alternatives].filter(Boolean);
    expect(candidates.map((item) => item?.kind).sort()).toEqual(['mcp', 'skill']);
    const skill = candidates.find((item) => item?.kind === 'skill')!;
    expect(skill.sourceCount).toBe(2);
    expect([skill.id, ...skill.otherSources!.map((item) => item.id)].sort()).toEqual(['s1', 's2']);
  });

  test('does not learn from unaccepted recommendation history', () => {
    const graph = workflowGraph();
    const query = 'video analysis';
    const baseline = find(query, { graph });
    const biased = find(query, { graph, history: Array(20).fill({ recommended: 'video-generation', used: null }) });
    expect(biased).toEqual(baseline);
  });

  test('negative clauses do not seed positive generation matches', () => {
    const graph = workflowGraph();
    const result = recommend('分析本地视频，不要生成新的影像', { graph });
    expect(result.primary?.name).toBe('video-evidence-workbench');
    expect(result.workflow).toEqual([]);
  });

  test('honors an explicit avoidWhen scope', () => {
    const graph = workflowGraph();
    graph.addNode(localCapability('picture-generator', 'Create reference video analysis images', {
      schema: { useWhen: [], avoidWhen: ['已有视频'], inputs: [], workflow: [], verification: [],
        doneWhen: [], contextNeeded: [], guardrails: [] },
    }));
    expect(find('分析已有视频', { graph }).map((item) => item.skill)).not.toContain('picture-generator');
  });

  test('keeps a skill explicit-only policy in the discovery result', () => {
    const graph = new Graph();
    graph.addNode(localCapability('special-task', 'Special task', { invocationPolicy: 'explicit-only' }));
    expect(recommend('special-task', { graph }).primary?.invocationPolicy).toBe('explicit-only');
    expect(formatDecisionMarkdown(recommend('special-task', { graph }))).toContain('explicit-only');
  });

  test('reuses metadata safely when fields, arrays, or graph membership change', () => {
    const graph = new Graph();
    const entry = localCapability('entry', 'solar observation', { triggers: ['sunspot'], tags: ['optics'] });
    graph.addNode(entry);
    expect(find('sunspot', { graph })[0]?.capability).toBe(entry);
    entry.description = 'ocean currents';
    entry.triggers![0] = 'tide';
    entry.tags[0] = 'water';
    expect(find('sunspot', { graph })).toEqual([]);
    expect(find('tide', { graph })[0]?.capability).toBe(entry);
    entry.name = 'marine';
    expect(find('marine', { graph })[0]?.skill).toBe('marine');
    entry.status = 'disabled';
    expect(find('marine', { graph })).toEqual([]);
    graph.removeNode(entry.id);
    graph.addNode(localCapability('replacement', 'snow observation', { id: entry.id }));
    expect(find('snow', { graph })[0]?.skill).toBe('replacement');
    expect(find('tide', { graph })).toEqual([]);
  });
});
