export interface TaskSignal {
  source: 'user_query' | 'file_change' | 'git_event' | 'pattern_match';
  content: string;
  context: {
    files_changed?: string[];
    branch?: string;
    recent_skills?: string[];
  };
}

export interface Enhancement {
  type: 'skill' | 'plugin' | 'tool' | 'mode';
  name: string;
  config?: Record<string, unknown>;
  priority: number;
  reason: string;
}

export interface OrchestrationPlan {
  trigger: TaskSignal;
  enhancements: Enhancement[];
  sequence: 'parallel' | 'sequential';
  confidence: number;
  reason: string;
  autoActivate: boolean;
}

export interface EngineOptions {
  autoActivate?: boolean;
  confidenceThreshold?: number;
  maxEnhancements?: number;
  disabledRules?: string[];
}
