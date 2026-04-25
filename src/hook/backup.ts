import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { HookInstallScope } from './types.js';

export type HookBackupFileKey = 'settings' | 'statuslineChain' | 'installStateMap' | 'legacyInstallState';

export interface HookBackupFile {
  key: HookBackupFileKey;
  sourcePath: string;
  backupName: string;
  existed: boolean;
}

export interface HookBackupManifest {
  id: string;
  scope: HookInstallScope;
  createdAt: string;
  files: HookBackupFile[];
}

export interface CreateHookBackupOptions {
  scope: HookInstallScope;
  settingsPath: string;
  statuslineChainPath: string;
  installStateMapPath: string;
  legacyInstallStatePath: string;
  now?: Date;
}

export function getHookBackupRoot(settingsPath: string): string {
  return join(dirname(settingsPath), 'lazybrain-backups');
}

function timestampId(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

function backupFileName(key: HookBackupFileKey, sourcePath: string): string {
  return `${key}-${basename(sourcePath)}`;
}

export function createHookBackup(options: CreateHookBackupOptions): HookBackupManifest {
  const now = options.now ?? new Date();
  const id = timestampId(now);
  const backupDir = join(getHookBackupRoot(options.settingsPath), id);
  mkdirSync(backupDir, { recursive: true });

  const files: HookBackupFile[] = [
    { key: 'settings', sourcePath: options.settingsPath, backupName: backupFileName('settings', options.settingsPath), existed: existsSync(options.settingsPath) },
    { key: 'statuslineChain', sourcePath: options.statuslineChainPath, backupName: backupFileName('statuslineChain', options.statuslineChainPath), existed: existsSync(options.statuslineChainPath) },
    { key: 'installStateMap', sourcePath: options.installStateMapPath, backupName: backupFileName('installStateMap', options.installStateMapPath), existed: existsSync(options.installStateMapPath) },
    { key: 'legacyInstallState', sourcePath: options.legacyInstallStatePath, backupName: backupFileName('legacyInstallState', options.legacyInstallStatePath), existed: existsSync(options.legacyInstallStatePath) },
  ];

  for (const file of files) {
    if (!file.existed) continue;
    copyFileSync(file.sourcePath, join(backupDir, file.backupName));
  }

  const manifest: HookBackupManifest = {
    id,
    scope: options.scope,
    createdAt: now.toISOString(),
    files,
  };
  writeFileSync(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  return manifest;
}

export function listHookBackups(settingsPath: string): HookBackupManifest[] {
  const root = getHookBackupRoot(settingsPath);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((id) => {
      const manifestPath = join(root, id, 'manifest.json');
      if (!existsSync(manifestPath)) return null;
      try {
        return JSON.parse(readFileSync(manifestPath, 'utf-8')) as HookBackupManifest;
      } catch {
        return null;
      }
    })
    .filter((manifest): manifest is HookBackupManifest => Boolean(manifest))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function findHookBackup(settingsPath: string, id?: string): HookBackupManifest | null {
  const backups = listHookBackups(settingsPath);
  if (id) return backups.find((backup) => backup.id === id) ?? null;
  return backups.at(-1) ?? null;
}

export function restoreHookBackup(settingsPath: string, manifest: HookBackupManifest): void {
  const backupDir = join(getHookBackupRoot(settingsPath), manifest.id);
  for (const file of manifest.files) {
    if (file.existed) {
      const backupPath = join(backupDir, file.backupName);
      if (!existsSync(backupPath)) continue;
      mkdirSync(dirname(file.sourcePath), { recursive: true });
      copyFileSync(backupPath, file.sourcePath);
    } else {
      rmSync(file.sourcePath, { force: true });
    }
  }
}
