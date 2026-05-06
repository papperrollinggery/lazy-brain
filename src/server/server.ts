/**
 * LazyBrain — Local HTTP Server
 *
 * Starts a local-only HTTP API on 127.0.0.1:18450 (default).
 * Used by hooks (fast path) and future desktop UI.
 */

import * as http from 'node:http';
import { writeFileSync, unlinkSync } from 'node:fs';
import { Graph } from '../graph/graph.js';
import { loadConfig } from '../config/config.js';
import { GRAPH_PATH } from '../constants.js';
import { createRouter } from './router.js';
import { getPackageVersion } from '../version.js';
import { DEFAULT_PORT, SERVER_PID_FILE, SERVER_RUNNING_FLAG } from './liveness.js';

export {
  DEFAULT_PORT,
  SERVER_PID_FILE,
  SERVER_RUNNING_FLAG,
  getServerPid,
  getServerPort,
  getServerRuntimeState,
  isServerRunning,
} from './liveness.js';

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
    version: getPackageVersion(),
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
