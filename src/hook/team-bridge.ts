import type { TeamComposition } from '../matcher/team-recommender.js';

export function formatTeamBridgeContext(query: string, composition: TeamComposition): string {
  const lines: string[] = [];
  lines.push('## Team Bridge');
  lines.push('');
  lines.push('The user is asking for team-mode execution.');
  lines.push(`Task: ${query}`);
  lines.push(`OMC command: ${composition.omcBridge.command}`);
  lines.push('');
  lines.push('Use this as the lead brief when starting team mode:');
  lines.push('```text');
  lines.push(composition.omcBridge.leadBrief);
  lines.push('```');
  lines.push('');
  lines.push('LazyBrain recommended specialists from the broader inventory:');
  for (const member of composition.members.slice(0, 5)) {
    lines.push(`- ${member.agent.name}: ${member.reason}`);
  }
  lines.push('');
  lines.push('If native team mode cannot spawn these exact specialist names, preserve the same decomposition and verification intent with the closest built-in agents.');
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}
