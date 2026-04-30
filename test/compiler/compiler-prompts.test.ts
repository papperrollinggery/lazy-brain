import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compiler.js';
import type { LLMProvider, RawCapability } from '../../src/types.js';

function raw(name: string): RawCapability {
  return {
    kind: 'skill',
    name,
    description: `${name} description`,
    origin: 'test',
    filePath: `/test/${name}/SKILL.md`,
    compatibility: ['claude-code'],
    triggers: ['ui', 'frontend'],
  };
}

function recorder(prompts: string[]): LLMProvider {
  return {
    async complete(prompt: string) {
      prompts.push(prompt);
      if (prompt.includes('REL_CUSTOM')) {
        return { content: '[]', inputTokens: 1, outputTokens: 1 };
      }
      return {
        content: JSON.stringify({
          tags: ['frontend', 'ui'],
          exampleQueries: ['redesign this page'],
          category: 'frontend',
          scenario: 'Use for frontend UI work',
        }),
        inputTokens: 1,
        outputTokens: 1,
      };
    },
  };
}

describe('compiler prompt overrides', () => {
  it('uses compileTagPrompt for tag enrichment', async () => {
    const prompts: string[] = [];

    await compile([raw('frontend-design')], {
      llm: recorder(prompts),
      modelName: 'test-model',
      skipRelations: true,
      config: {
        compileTagPrompt: 'TAG_CUSTOM name=${name} kind=${kind} triggers=${triggers}',
      },
    });

    expect(prompts[0]).toContain('TAG_CUSTOM name=frontend-design');
    expect(prompts[0]).toContain('triggers=ui, frontend');
  });

  it('uses compileRelationPrompt for relation inference', async () => {
    const prompts: string[] = [];

    await compile([raw('frontend-design'), raw('design-review')], {
      llm: recorder(prompts),
      modelName: 'test-model',
      forceRelations: true,
      relationBatchSize: 2,
      config: {
        compileRelationPrompt: 'REL_CUSTOM cap=${cap.name} neighbors=${neighbors}',
      },
    });

    const relationPrompt = prompts.find(prompt => prompt.includes('REL_CUSTOM'));
    expect(relationPrompt).toContain('cap=frontend-design');
    expect(relationPrompt).toContain('design-review');
  });

  it('parses JSON from fenced model responses with comments', async () => {
    const graph = await compile([raw('frontend-design')], {
      llm: {
        async complete() {
          return {
            content: `Here is the metadata:
\`\`\`json
{
  "tags": ["frontend", "ui"], // model copied a comment
  "exampleQueries": ["redesign this page"],
  "category": "frontend",
  "scenario": "Use for frontend UI work",
}
\`\`\``,
            inputTokens: 1,
            outputTokens: 1,
          };
        },
      },
      modelName: 'test-model',
      skipRelations: true,
    });

    const node = graph.graph.findByName('frontend-design');
    expect(node?.category).toBe('frontend');
    expect(node?.tags).toEqual(['frontend', 'ui']);
  });

  it('parses relation arrays from noisy model responses', async () => {
    let calls = 0;

    const result = await compile([raw('frontend-design'), raw('design-review')], {
      llm: {
        async complete() {
          calls++;
          if (calls <= 2) {
            return {
              content: JSON.stringify({
                tags: ['frontend', 'ui'],
                exampleQueries: ['redesign this page'],
                category: 'frontend',
                scenario: 'Use for frontend UI work',
              }),
              inputTokens: 1,
              outputTokens: 1,
            };
          }
          return {
            content: `Relationships:
\`\`\`json
[
  {
    "target": "design-review",
    "type": "depends_on",
    "description": "Review follows implementation",
    "confidence": 0.8,
  }
]
\`\`\``,
            inputTokens: 1,
            outputTokens: 1,
          };
        },
      },
      modelName: 'test-model',
      forceRelations: true,
    });

    expect(result.graph.getAllLinks().some(link => link.type === 'depends_on')).toBe(true);
  });
});
