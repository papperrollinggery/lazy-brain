#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.artifact) {
    throw new Error("Missing --artifact <artifact.json>");
  }

  const recordPath = args.record ?? "docs/GST-140-hourly-comment-records.jsonl";
  const source = JSON.parse(fs.readFileSync(args.artifact, "utf8"));

  const record = {
    issueId: source.issueId,
    timestamp: source.nowIso,
    gateLevel: source.gate?.gateLevel ?? "UNKNOWN",
    gateAction: source.gate?.gateAction ?? "UNKNOWN",
    min5hRatio: source.gate?.min5hRatio ?? null,
    oneWeekRatio: source.gate?.oneWeekRatio ?? null,
    sparkRoute: source.spark?.sparkRoute ?? "UNKNOWN",
    sparkAction: source.spark?.sparkAction ?? "UNKNOWN",
    rollbackCount: source.rollbackCount ?? 0,
    deferredTaskCount: source.deferredTaskCount ?? 0,
    post: source.post ?? "",
  };

  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.appendFileSync(recordPath, `${JSON.stringify(record)}\n`, "utf8");
  process.stdout.write(`${recordPath}\n`);
}

main();
