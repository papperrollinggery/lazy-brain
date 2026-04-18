/**
 * LazyBrain — Budget State Machine
 *
 * Tracks Claude API usage and determines budget mode:
 * - normal: daily < 70%
 * - caution: 70% ≤ daily < 90%
 * - restricted: daily ≥ 90%
 * - survival: daily exhausted OR free models all down
 *
 * Configuration via environment variables:
 * - LAZYBRAIN_CLAUDE_DAILY: daily budget in USD (default: $2)
 * - LAZYBRAIN_CLAUDE_MONTHLY: monthly budget in USD (default: $30)
 */

import { readFileSync, existsSync } from 'node:fs';
import { LAZYBRAIN_DIR } from '../constants.js';

const USAGE_PATH = `${LAZYBRAIN_DIR}/usage.jsonl`;

// ─── Budget Configuration ─────────────────────────────────────────────────────

export const DEFAULT_DAILY_BUDGET = 2.0; // USD
export const DEFAULT_MONTHLY_BUDGET = 30.0; // USD

/** Get daily budget from env or default */
export function getDailyBudget(): number {
  const env = process.env.LAZYBRAIN_CLAUDE_DAILY;
  if (env) {
    const parsed = parseFloat(env);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_DAILY_BUDGET;
}

/** Get monthly budget from env or default */
export function getMonthlyBudget(): number {
  const env = process.env.LAZYBRAIN_CLAUDE_MONTHLY;
  if (env) {
    const parsed = parseFloat(env);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MONTHLY_BUDGET;
}

// ─── State Types ───────────────────────────────────────────────────────────────

export type BudgetMode = 'normal' | 'caution' | 'restricted' | 'survival';

export interface ClaudeDailyUsage {
  used: number;   // USD spent today
  limit: number;  // Daily budget limit
}

export interface ModelStatus {
  available: boolean;
  reason?: string;
}

export interface BudgetState {
  mode: BudgetMode;
  claudeDaily: ClaudeDailyUsage;
  claudeMonthly: {
    used: number;
    limit: number;
  };
  miniMaxStatus: ModelStatus;
  nemotronStatus: ModelStatus;
}

// ─── Usage Parsing ────────────────────────────────────────────────────────────

export interface UsageEntry {
  timestamp: string;
  sessionId: string;
  costUsd: number;
  model: string;
}

/** Load all usage entries from usage.jsonl */
export function loadUsageEntries(): UsageEntry[] {
  if (!existsSync(USAGE_PATH)) return [];
  try {
    const raw = readFileSync(USAGE_PATH, 'utf-8');
    return raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as UsageEntry);
  } catch {
    return [];
  }
}

/** Get today's date string (YYYY-MM-DD) */
export function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

/** Get current month string (YYYY-MM) */
export function getMonthString(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Compute total cost for today from usage entries */
export function computeDailyCost(entries: UsageEntry[]): number {
  const today = getTodayString();
  return entries
    .filter(e => e.timestamp.startsWith(today))
    .reduce((sum, e) => sum + e.costUsd, 0);
}

/** Compute total cost for current month from usage entries */
export function computeMonthlyCost(entries: UsageEntry[]): number {
  const month = getMonthString();
  return entries
    .filter(e => e.timestamp.startsWith(month))
    .reduce((sum, e) => sum + e.costUsd, 0);
}

// ─── State Determination ─────────────────────────────────────────────────────

/** Determine budget mode based on daily usage percentage */
export function determineMode(dailyUsed: number, dailyLimit: number): BudgetMode {
  if (dailyLimit <= 0) return 'survival';
  
  const percentage = (dailyUsed / dailyLimit) * 100;
  
  if (percentage >= 100) return 'survival';  // daily exhausted
  if (percentage >= 90) return 'restricted';
  if (percentage >= 70) return 'caution';
  return 'normal';
}

// ─── Model Status Check ───────────────────────────────────────────────────────

/**
 * Check MiniMax API availability.
 * MiniMax is considered unavailable if:
 * - MINIMAX_API_KEY is not set
 * - API returns error on health check
 */
export async function checkMiniMaxStatus(): Promise<ModelStatus> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return { available: false, reason: 'MINIMAX_API_KEY not configured' };
  }
  
  try {
    const response = await fetch('https://api.minimaxi.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    
    if (response.ok) {
      return { available: true };
    }
    
    if (response.status === 401 || response.status === 403) {
      return { available: false, reason: 'API key invalid or expired' };
    }
    
    if (response.status === 429) {
      return { available: false, reason: 'Rate limited' };
    }
    
    return { available: false, reason: `HTTP ${response.status}` };
  } catch (err) {
    const error = err as Error;
    if (error.name === 'TimeoutError') {
      return { available: false, reason: 'Connection timeout' };
    }
    if (error.cause && (error.cause as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
      return { available: false, reason: 'Connection refused' };
    }
    return { available: false, reason: error.message || 'Unknown error' };
  }
}

/**
 * Check Nemotron status (free model, assumed available unless explicitly disabled).
 * In practice, nemotron-3-super-free is an OpenCode built-in and rarely goes down.
 */
export async function checkNemotronStatus(): Promise<ModelStatus> {
  // Nemotron is a free built-in model, assumed available
  // In the contingency doc, it says nemotron is free and unaffected by MiniMax downtime
  return { available: true };
}

/**
 * Check if we should enter survival mode due to free models being down.
 * Currently checks MiniMax availability.
 */
export async function checkFreeModelsDown(): Promise<boolean> {
  const miniMax = await checkMiniMaxStatus();
  // If MiniMax (paid) is down, we rely on free models
  // If BOTH MiniMax AND Nemotron are down, we're in survival
  const nemotron = await checkNemotronStatus();
  return !miniMax.available && !nemotron.available;
}

// ─── Main State Machine ──────────────────────────────────────────────────────

/**
 * Compute the current budget state.
 * Reads usage.jsonl to calculate daily/monthly costs.
 */
export async function computeBudgetState(): Promise<BudgetState> {
  const entries = loadUsageEntries();
  const dailyLimit = getDailyBudget();
  const monthlyLimit = getMonthlyBudget();
  
  const dailyUsed = computeDailyCost(entries);
  const monthlyUsed = computeMonthlyCost(entries);
  
  const mode = determineMode(dailyUsed, dailyLimit);
  
  const miniMaxStatus = await checkMiniMaxStatus();
  const nemotronStatus = await checkNemotronStatus();
  
  // Check survival conditions
  const freeModelsDown = await checkFreeModelsDown();
  const effectiveMode: BudgetMode = freeModelsDown || mode === 'survival' ? 'survival' : mode;
  
  return {
    mode: effectiveMode,
    claudeDaily: {
      used: Math.round(dailyUsed * 1000) / 1000,
      limit: dailyLimit,
    },
    claudeMonthly: {
      used: Math.round(monthlyUsed * 1000) / 1000,
      limit: monthlyLimit,
    },
    miniMaxStatus,
    nemotronStatus,
  };
}

/**
 * Synchronous budget state computation (for testing).
 * Assumes all models are available.
 */
export function computeBudgetStateSync(): BudgetState {
  const entries = loadUsageEntries();
  const dailyLimit = getDailyBudget();
  const monthlyLimit = getMonthlyBudget();
  
  const dailyUsed = computeDailyCost(entries);
  const monthlyUsed = computeMonthlyCost(entries);
  
  const mode = determineMode(dailyUsed, dailyLimit);
  
  return {
    mode,
    claudeDaily: {
      used: Math.round(dailyUsed * 1000) / 1000,
      limit: dailyLimit,
    },
    claudeMonthly: {
      used: Math.round(monthlyUsed * 1000) / 1000,
      limit: monthlyLimit,
    },
    miniMaxStatus: { available: true },
    nemotronStatus: { available: true },
  };
}

// ─── Budget State File ───────────────────────────────────────────────────────

export const BUDGET_STATE_PATH = `${LAZYBRAIN_DIR}/budget-state.json`;

/**
 * Write budget state to budget-state.json.
 * Called after each usage entry is written.
 */
export function writeBudgetState(state: BudgetState): void {
  const { writeFileSync } = require('node:fs');
  writeFileSync(BUDGET_STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

/**
 * Load budget state from budget-state.json.
 */
export function loadBudgetState(): BudgetState | null {
  if (!existsSync(BUDGET_STATE_PATH)) return null;
  try {
    const raw = readFileSync(BUDGET_STATE_PATH, 'utf-8');
    return JSON.parse(raw) as BudgetState;
  } catch {
    return null;
  }
}
