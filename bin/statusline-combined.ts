#!/usr/bin/env node
/**
 * LazyBrain combined statusline.
 *
 * Claude Code supports a single statusLine command. This wrapper lets
 * LazyBrain coexist with an existing HUD by running the upstream HUD first,
 * then appending LazyBrain's compact status label.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getStatuslineChainPath } from '../src/constants.js';
import { simplifyUpstreamHud, isLowSignalLazyBrainLabel } from '../src/utils/hud-normalizer.js';

interface ChainConfig {
  upstreamCommand?: string;
  upstreamType?: string;
  installedAt?: string;
}

function readStdin(): string {
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function readChainConfig(): ChainConfig {
  const explicitChainPath = process.env.LAZYBRAIN_STATUSLINE_CHAIN;
  if (explicitChainPath) {
    try {
      if (!existsSync(explicitChainPath)) return {};
      return JSON.parse(readFileSync(explicitChainPath, 'utf-8')) as ChainConfig;
    } catch {
      return {};
    }
  }

  const candidates = [
    join(resolve(process.cwd(), '.claude'), 'lazybrain-statusline-chain.json'),
    getStatuslineChainPath(),
    `${process.env.HOME ?? ''}/.lazybrain/statusline-chain.json`,
  ].filter((path): path is string => Boolean(path));

  for (const chainPath of candidates) {
    try {
      if (!existsSync(chainPath)) continue;
      return JSON.parse(readFileSync(chainPath, 'utf-8')) as ChainConfig;
    } catch {}
  }

  return {};
}

function runCommand(command: string, stdin: string, extraEnv: Record<string, string> = {}): string {
  try {
    return execSync(command, {
      input: stdin,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 5000,
      env: { ...process.env, ...extraEnv },
    }).trim();
  } catch {
    return '';
  }
}

function isSelfCommand(command: string): boolean {
  return command.includes('statusline-combined.js');
}

function main(): void {
  const stdin = readStdin();
  const chain = readChainConfig();
  const upstreamCommand = chain.upstreamCommand?.trim();
  const upstreamRaw = upstreamCommand && !isSelfCommand(upstreamCommand)
    ? runCommand(upstreamCommand, stdin)
    : '';
  const upstream = simplifyUpstreamHud(upstreamRaw);
  const lazybrain = runCommand(
    `node ${JSON.stringify(new URL('./statusline.js', import.meta.url).pathname)}`,
    stdin,
    { LAZYBRAIN_STATUSLINE_LABEL_ONLY: '1' },
  );

  if (upstream && lazybrain) {
    if (isLowSignalLazyBrainLabel(lazybrain)) {
      process.stdout.write(`${upstream}\n`);
      return;
    }
    process.stdout.write(`${upstream}  ${lazybrain}\n`);
    return;
  }
  if (upstream) {
    process.stdout.write(`${upstream}\n`);
    return;
  }
  if (lazybrain) {
    process.stdout.write(`${lazybrain}\n`);
  }
}

main();
