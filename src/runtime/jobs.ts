import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JOBS_DIR, JOBS_LATEST_PATH } from '../constants.js';

export type JobKind = 'scan' | 'compile' | 'embedding' | 'doctor' | 'gitnexus' | 'cache';
export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'stale';

export interface BackendJob {
  id: string;
  kind: JobKind;
  state: JobState;
  progress?: string;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
  exitCode?: number | null;
  error?: string;
  recentLog: string[];
  result?: unknown;
}

interface LatestJobsIndex {
  updatedAt: string;
  ids: string[];
  latestByKind: Partial<Record<JobKind, string>>;
}

interface LocalActiveJob {
  kind: JobKind;
  cancel: () => boolean;
}

const localActiveJobs = new Map<string, LocalActiveJob>();
const TERMINAL_STATES = new Set<JobState>(['succeeded', 'failed', 'cancelled', 'stale']);

function nowIso(): string {
  return new Date().toISOString();
}

function latestPathFor(jobsDir: string): string {
  return jobsDir === JOBS_DIR ? JOBS_LATEST_PATH : join(jobsDir, 'latest.json');
}

function ensureJobsDir(jobsDir = JOBS_DIR): void {
  mkdirSync(jobsDir, { recursive: true });
}

function jobPath(id: string, jobsDir = JOBS_DIR): string {
  return join(jobsDir, `${id}.json`);
}

function safeJobId(id: string): boolean {
  return /^[a-z][a-z0-9-]{2,120}$/i.test(id);
}

function readLatestIndex(jobsDir = JOBS_DIR): LatestJobsIndex {
  const path = latestPathFor(jobsDir);
  if (!existsSync(path)) return { updatedAt: nowIso(), ids: [], latestByKind: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<LatestJobsIndex>;
    return {
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : nowIso(),
      ids: Array.isArray(parsed.ids) ? parsed.ids.filter((id): id is string => typeof id === 'string') : [],
      latestByKind: parsed.latestByKind && typeof parsed.latestByKind === 'object' ? parsed.latestByKind : {},
    };
  } catch {
    return { updatedAt: nowIso(), ids: [], latestByKind: {} };
  }
}

function writeLatestIndex(index: LatestJobsIndex, jobsDir = JOBS_DIR): void {
  ensureJobsDir(jobsDir);
  writeFileSync(latestPathFor(jobsDir), JSON.stringify(index, null, 2), 'utf-8');
}

function rememberJob(job: BackendJob, jobsDir = JOBS_DIR): void {
  const index = readLatestIndex(jobsDir);
  index.ids = [job.id, ...index.ids.filter(id => id !== job.id)].slice(0, 200);
  index.latestByKind[job.kind] = job.id;
  index.updatedAt = nowIso();
  writeLatestIndex(index, jobsDir);
}

export function createJob(
  kind: JobKind,
  init: Partial<Omit<BackendJob, 'id' | 'kind' | 'updatedAt' | 'recentLog'>> = {},
  jobsDir = JOBS_DIR,
): BackendJob {
  ensureJobsDir(jobsDir);
  const timestamp = Date.now().toString(36);
  const id = `${kind}-${timestamp}-${randomUUID().slice(0, 8)}`;
  const updatedAt = nowIso();
  const job: BackendJob = {
    id,
    kind,
    state: init.state ?? 'queued',
    progress: init.progress,
    startedAt: init.startedAt,
    updatedAt,
    finishedAt: init.finishedAt,
    exitCode: init.exitCode,
    error: init.error,
    recentLog: [],
    result: init.result,
  };
  writeFileSync(jobPath(id, jobsDir), JSON.stringify(job, null, 2), 'utf-8');
  rememberJob(job, jobsDir);
  return job;
}

export function getJob(id: string, jobsDir = JOBS_DIR): BackendJob | null {
  if (!safeJobId(id)) return null;
  const path = jobPath(id, jobsDir);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as BackendJob;
    if (!parsed || parsed.id !== id || typeof parsed.kind !== 'string') return null;
    return {
      ...parsed,
      recentLog: Array.isArray(parsed.recentLog) ? parsed.recentLog.filter((line): line is string => typeof line === 'string') : [],
    };
  } catch {
    return null;
  }
}

export function updateJob(
  id: string,
  patch: Partial<Omit<BackendJob, 'id' | 'kind'>>,
  jobsDir = JOBS_DIR,
): BackendJob | null {
  const existing = getJob(id, jobsDir);
  if (!existing) return null;
  const updatedAt = nowIso();
  const state = patch.state ?? existing.state;
  const next: BackendJob = {
    ...existing,
    ...patch,
    updatedAt,
    finishedAt: patch.finishedAt ?? (TERMINAL_STATES.has(state) ? existing.finishedAt ?? updatedAt : existing.finishedAt),
    recentLog: patch.recentLog ?? existing.recentLog,
  };
  writeFileSync(jobPath(id, jobsDir), JSON.stringify(next, null, 2), 'utf-8');
  rememberJob(next, jobsDir);
  return next;
}

export function appendJobLog(id: string, lines: string[], jobsDir = JOBS_DIR): BackendJob | null {
  const clean = lines.map(line => line.trim()).filter(Boolean);
  if (clean.length === 0) return getJob(id, jobsDir);
  const job = getJob(id, jobsDir);
  if (!job) return null;
  return updateJob(id, { recentLog: [...job.recentLog, ...clean].slice(-100) }, jobsDir);
}

export function listJobs(options: { limit?: number; jobsDir?: string } = {}): BackendJob[] {
  const jobsDir = options.jobsDir ?? JOBS_DIR;
  if (!existsSync(jobsDir)) return [];
  const jobs = readdirSync(jobsDir)
    .filter(name => name.endsWith('.json') && name !== 'latest.json')
    .map(name => getJob(name.slice(0, -5), jobsDir))
    .filter((job): job is BackendJob => Boolean(job))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return jobs.slice(0, Math.max(1, Math.min(options.limit ?? 20, 100)));
}

export function listActiveJobs(options: { kind?: JobKind; localOnly?: boolean; jobsDir?: string } = {}): BackendJob[] {
  return listJobs({ limit: 100, jobsDir: options.jobsDir }).filter((job) => {
    if (options.kind && job.kind !== options.kind) return false;
    if (job.state !== 'queued' && job.state !== 'running') return false;
    return options.localOnly ? localActiveJobs.has(job.id) : true;
  });
}

export function hasLocalActiveJob(kind?: JobKind): boolean {
  for (const active of localActiveJobs.values()) {
    if (!kind || active.kind === kind) return true;
  }
  return false;
}

export function registerJobCanceller(id: string, kind: JobKind, cancel: () => boolean): void {
  localActiveJobs.set(id, { kind, cancel });
}

export function clearJobCanceller(id: string): void {
  localActiveJobs.delete(id);
}

export function cancelJob(id: string): { ok: boolean; job: BackendJob | null; error?: string } {
  const job = getJob(id);
  if (!job) return { ok: false, job: null, error: `Job not found: ${id}` };
  if (TERMINAL_STATES.has(job.state)) return { ok: false, job, error: `Job is already ${job.state}` };
  const active = localActiveJobs.get(id);
  if (!active) {
    const stale = updateJob(id, { state: 'stale', error: 'no active local process' });
    return { ok: false, job: stale, error: 'Job has no active local process' };
  }
  const cancelled = active.cancel();
  clearJobCanceller(id);
  const updated = updateJob(id, {
    state: cancelled ? 'cancelled' : 'failed',
    error: cancelled ? undefined : 'cancel handler failed',
  });
  return { ok: cancelled, job: updated, error: cancelled ? undefined : 'Cancel handler failed' };
}
