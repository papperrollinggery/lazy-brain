export type CapabilityKind = 'skill' | 'plugin' | 'mcp' | 'agent' | 'command' | 'mode' | 'hook';

export type Platform =
  | 'claude-code'
  | 'cursor'
  | 'codex'
  | 'kiro'
  | 'opencode'
  | 'universal';

export interface CapabilityMeta {
  stars?: number;
  reviews?: number;
  url?: string;
  version?: string;
  lastUpdated?: string;
}

export type CapabilitySideEffect =
  | 'reads_files'
  | 'writes_files'
  | 'executes_commands'
  | 'network'
  | 'changes_config'
  | 'installs_hooks'
  | 'publishes'
  | 'destructive'
  | 'unknown';

/** Evidence recorded during discovery. It does not assert runtime availability. */
export type CapabilityDiscovery = 'local-file' | 'plugin-cache' | 'configured' | 'catalog-entry' | 'builtin-example';

/** Whether a host may select a capability without an explicit user invocation. */
export type InvocationPolicy = 'implicit-allowed' | 'explicit-only';

export interface WorkflowStep {
  id?: string;
  title: string;
  detail?: string;
  source?: 'schema' | 'combo' | 'verification' | 'fallback';
}

export interface VerificationRequirement {
  id?: string;
  title: string;
  detail?: string;
  command?: string;
  required: boolean;
  source?: 'schema' | 'catalog' | 'combo' | 'fallback';
}

export interface GuardrailRule {
  title: string;
  detail?: string;
  strength?: 'light' | 'normal' | 'strict';
  source?: 'schema' | 'target' | 'combo' | 'fallback';
}

export interface SkillSchema {
  useWhen: string[];
  avoidWhen: string[];
  inputs: string[];
  workflow: WorkflowStep[];
  verification: VerificationRequirement[];
  doneWhen: string[];
  contextNeeded: string[];
  guardrails: GuardrailRule[];
  warnings?: string[];
}

export interface Capability {
  id: string;
  kind: CapabilityKind;
  name: string;
  description: string;
  origin: string;
  provider?: string;
  conflictGroup?: string;
  sideEffects?: CapabilitySideEffect[];
  status: 'installed' | 'available' | 'disabled';
  compatibility: Platform[];
  filePath?: string;
  tags: string[];
  exampleQueries: string[];
  category: string;
  scenario?: string;
  explanation_template?: string;
  triggers?: string[];
  aliases?: string[];
  tier?: 0 | 1 | 2;
  evolvedTags?: string[];
  costLevel?: 'free' | 'low' | 'medium' | 'high';
  riskLevel?: 'safe' | 'caution' | 'destructive';
  requiresConfirmation?: boolean;
  hiddenByDefault?: boolean;
  sourcePriority?: number;
  overlapsWith?: string[];
  meta?: CapabilityMeta;
  schema?: SkillSchema;
  discovery?: CapabilityDiscovery;
  invocationPolicy?: InvocationPolicy;
}

export const LINK_TYPES = ['similar_to', 'composes_with', 'supersedes', 'depends_on', 'belongs_to'] as const;
export type LinkType = typeof LINK_TYPES[number];

export function isLinkType(value: unknown): value is LinkType {
  return typeof value === 'string' && (LINK_TYPES as readonly string[]).includes(value);
}

export interface Link {
  source: string;
  target: string;
  type: LinkType;
  description?: string;
  diff?: string;
  confidence: number;
}

export interface CapabilityGraph {
  version: string;
  compiledAt: string;
  compileModel?: string;
  compileErrors?: string[];
  nodes: Capability[];
  links: Link[];
  categories: string[];
}

export type MatchLayer = 'alias' | 'tag';
export type Confidence = 'high' | 'medium' | 'low';

export interface MatchResult {
  capability: Capability;
  score: number;
  layer: MatchLayer;
  confidence: Confidence;
  historyBoost?: number;
  explanation?: string;
}

export interface Recommendation {
  matches: MatchResult[];
  comparisons: Array<{ a: Capability; b: Capability; diff: string }>;
  compositions: Array<{ capabilities: Capability[]; reason: string }>;
  upgrades: Array<{ old: Capability; new: Capability }>;
  external: MatchResult[];
  warnings?: string[];
}

export interface RawCapability {
  kind: CapabilityKind;
  name: string;
  description: string;
  origin: string;
  provider?: string;
  conflictGroup?: string;
  sideEffects?: CapabilitySideEffect[];
  filePath: string;
  triggers?: string[];
  compatibility: Platform[];
  meta?: CapabilityMeta;
  tier?: 0 | 1 | 2;
  disabled?: boolean;
  platform?: Platform;
  schema?: SkillSchema;
  discovery?: CapabilityDiscovery;
  invocationPolicy?: InvocationPolicy;
}

export interface UserConfig {
  aliases?: Record<string, string>;
  platform?: Platform;
  [key: string]: unknown;
}

export interface HistoryEntry {
  timestamp: string;
  query: string;
  matched: string;
  accepted: boolean;
  layer: MatchLayer;
  sessionId?: string;
  reason?: string;
}

export interface WikiCard {
  capability: Capability;
  primaryUse?: string;
  composesWith: Array<{ capability: Capability; reason: string }>;
  similarTo: Array<{ capability: Capability; diff: string }>;
  dependsOn: Array<{ capability: Capability }>;
  tags: string[];
  topExampleQueries: string[];
}
