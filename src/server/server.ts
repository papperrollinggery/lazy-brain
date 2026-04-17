/**
 * LazyBrain — Local HTTP Server
 *
 * Starts a local-only HTTP API on 127.0.0.1:18450 (default).
 * Used by hooks (fast path) and future desktop UI.
 */

import * as http from 'node:http';
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Graph } from '../graph/graph.js';
import { loadConfig } from '../config/config.js';
import { GRAPH_PATH, LAZYBRAIN_DIR } from '../constants.js';
import { createRouter } from './router.js';

export const DEFAULT_PORT = 18450;
export const SERVER_RUNNING_FLAG = join(LAZYBRAIN_DIR, '.server-running');
export const SERVER_PID_FILE = join(LAZYBRAIN_DIR, 'server.pid');

export interface ServerInstance {
  server: http.Server;
  port: number;
  close(): Promise<void>;
}

export function createServer(port: number = DEFAULT_PORT): ServerInstance {
  const config = loadConfig();
  let graph = Graph.load(GRAPH_PATH);

  const router = createRouter({
    getGraph: () => graph,
    config,
    version: '0.1.0',
    onReload: () => {
      graph = Graph.load(GRAPH_PATH);
    },
  });

  const server = http.createServer(router);

  server.listen(port, '127.0.0.1', () => {
    writeFileSync(SERVER_RUNNING_FLAG, String(port), 'utf-8');
    writeFileSync(SERVER_PID_FILE, String(process.pid), 'utf-8');
  });

  return {
    server,
    port,
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        try { unlinkSync(SERVER_RUNNING_FLAG); } catch {}
        try { unlinkSync(SERVER_PID_FILE); } catch {}
        server.close(err => (err ? reject(err) : resolve()));
      });
    },
  };
}

export function isServerRunning(): boolean {
  return existsSync(SERVER_RUNNING_FLAG);
}

export function getServerPort(): number {
  if (!existsSync(SERVER_RUNNING_FLAG)) return DEFAULT_PORT;
  const raw = readFileSync(SERVER_RUNNING_FLAG, 'utf-8').trim();
  const n = parseInt(raw, 10);
  return isNaN(n) ? DEFAULT_PORT : n;
}

export function getServerPid(): number | null {
  if (!existsSync(SERVER_PID_FILE)) return null;
  const raw = readFileSync(SERVER_PID_FILE, 'utf-8').trim();
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}
