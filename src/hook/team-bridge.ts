import type { TeamComposition } from '../matcher/team-recommender.js';

export function formatTeamBridgeContext(query: string, composition: TeamComposition): string {
  const lines: string[] = [];
  lines.push('## Team Bridge');
  lines.push('');
  lines.push('The user is asking for team-mode execution.');
  lines.push('LazyBrain is advisory only: do not auto-spawn agents unless the main model or user chooses to.');
  lines.push(`Task: ${query}`);
  lines.push(`Recommended main model: ${composition.mainModel.model} — ${composition.mainModel.reason}`);
  lines.push(`Token strategy: ${composition.tokenStrategy.summary}; ${composition.tokenStrategy.reason}.`);
  lines.push(`OMC command: ${composition.omcBridge.command}`);
  lines.push('');
  lines.push('Use this as the lead brief when starting team mode:');
  lines.push('```text');
  lines.push(composition.omcBridge.leadBrief);
  lines.push('```');
  lines.push('');
  lines.push('LazyBrain recommended specialists from the broader inventory:');
  for (const member of composition.members.slice(0, 5)) {
    const model = member.suggestedModel ? `, model=${member.suggestedModel}` : '';
    lines.push(`- ${member.agent.name}${model}: ${member.reason}`);
    if (member.prompt) {
      lines.push('```text');
      lines.push(member.prompt);
      lines.push('```');
    }
  }
  lines.push('');
  if (composition.runtimeGuides?.length) {
    lines.push('Runtime adapters:');
    for (const guide of composition.runtimeGuides) {
      const command = guide.command ? ` command=${guide.command}` : '';
      lines.push(`- ${guide.label}: ${guide.whenToUse}.${command}`);
    }
    lines.push('');
  }
  lines.push('If native team mode cannot spawn these exact specialist names, preserve the same decomposition and verification intent with the closest built-in agents.');
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}
