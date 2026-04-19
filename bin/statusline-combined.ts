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
  try {
    const chainPath = getStatuslineChainPath();
    if (!existsSync(chainPath)) return {};
    return JSON.parse(readFileSync(chainPath, 'utf-8')) as ChainConfig;
  } catch {}

  // Backward compatibility for earlier local builds that wrote this file to
  // ~/.lazybrain/statusline-chain.json. Avoid importing the constant so new
  // installs stay scoped to the active Claude config dir.
  try {
    const legacyPath = `${process.env.HOME ?? ''}/.lazybrain/statusline-chain.json`;
    if (!existsSync(legacyPath)) return {};
    return JSON.parse(readFileSync(legacyPath, 'utf-8')) as ChainConfig;
  } catch {
    return {};
  }
}

function runCommand(command: string, stdin: string): string {
  try {
    return execSync(command, {
      input: stdin,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 1500,
      env: process.env,
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
  const lazybrain = runCommand(`node ${JSON.stringify(new URL('./statusline.js', import.meta.url).pathname)}`, stdin);

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
