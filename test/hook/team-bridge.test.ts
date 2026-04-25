import { describe, expect, it } from 'vitest';
import { formatTeamBridgeContext } from '../../src/hook/team-bridge.js';
import type { Capability } from '../../src/types.js';
import type { TeamComposition } from '../../src/matcher/team-recommender.js';

function capability(name: string): Capability {
  return {
    id: name,
    kind: 'agent',
    name,
    description: `${name} description`,
    origin: 'test',
    status: 'installed',
    compatibility: ['claude-code'],
    tags: [name.toLowerCase()],
    exampleQueries: [],
    category: 'planning',
  };
}

describe('team bridge context', () => {
  it('formats an injectable OMC lead brief block', () => {
    const composition: TeamComposition = {
      members: [
        { agent: capability('architect'), reason: '规划/架构领域', category: 'planning' },
        { agent: capability('Workflow Architect'), reason: '多 Agent 编排领域', category: 'orchestration' },
      ],
      overallReason: '覆盖 planning + orchestration',
      suggestedCommand: '/team 2:mixed "task"',
      mainModel: {
        model: 'sonnet',
        reason: '主模型保留规划和合并判断',
        decisionOwner: 'main_model_or_user',
      },
      tokenStrategy: {
        summary: '主模型 sonnet 决策，子任务 2 个 sonnet + 0 个 haiku',
        reason: '只把对应子任务提示词交给对应 agent',
      },
      runtimeGuides: [
        {
          target: 'claude_subagent',
          label: 'Claude Code / Agent Agency subagents',
          whenToUse: '适用于 Claude Code Task 工具、Agent Agency、或类似子智能体选择器',
          leadPrompt: 'Task: task',
          memberPrompts: [],
          constraints: ['只作为建议，不自动启动或派生 agent'],
        },
      ],
      advisory: true,
      omcBridge: {
        workerType: 'executor',
        workerCount: 2,
        command: '/team 2:executor "task"',
        leadBrief: 'Lead brief: task="task"\nPreferred exec worker type: executor',
      },
    };

    const output = formatTeamBridgeContext('task', composition);

    expect(output).toContain('## Team Bridge');
    expect(output).toContain('/team 2:executor "task"');
    expect(output).toContain('Lead brief: task="task"');
    expect(output).toContain('advisory only');
    expect(output).toContain('Recommended main model: sonnet');
    expect(output).toContain('Runtime adapters');
    expect(output).toContain('Agent Agency');
    expect(output).toContain('architect');
    expect(output).toContain('Workflow Architect');
  });
});
