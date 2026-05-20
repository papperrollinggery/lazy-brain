export type {
  Capability,
  CapabilityGraph,
  CapabilityKind,
  CapabilityMeta,
  Link,
  LinkType,
  Platform,
  RawCapability,
  UserConfig,
} from './types.js';

export { BUILTIN_SKILLS } from './knowledge/builtin.js';
export type { BuiltinSkill } from './knowledge/builtin.js';
export { find, match } from './matcher/matcher.js';
export type { FindOptions, FindResult, MatchOptions } from './matcher/matcher.js';
export { append, getStats, loadRecent } from './history/history.js';
export type { HistoryEntry, UsageStats } from './history/history.js';
export { detectPatterns, unusedHighValue } from './insights/patterns.js';
export type { WorkflowPattern } from './insights/patterns.js';
export { orchestrate, explain, formatOrchestrationHint } from './orchestrator/engine.js';
export { signalFromFileChange, signalFromHook, signalFromQuery } from './orchestrator/signals.js';
export type { EngineOptions, Enhancement, OrchestrationPlan, TaskSignal } from './orchestrator/types.js';
export { COMBOS, findCombo, listCombos } from './combos/registry.js';
export { Graph } from './graph/graph.js';
export { scan, detectSources } from './scanner/scanner.js';
export type { ScanOptions, ScanResult, ScanSource } from './scanner/scanner.js';
export { box, bold, cyan, dim, green, highlight, progressBar, yellow } from './ui/terminal.js';
export { getPackageVersion } from './version.js';
