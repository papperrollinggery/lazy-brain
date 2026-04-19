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
    expect(output).toContain('architect');
    expect(output).toContain('Workflow Architect');
  });
});
