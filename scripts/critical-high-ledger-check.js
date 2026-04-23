#!/usr/bin/env node
import fs from "node:fs";

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
  const recordPath = args.record ?? "docs/GST-140-hourly-comment-records.jsonl";
  if (!fs.existsSync(recordPath)) {
    throw new Error(`Record not found: ${recordPath}`);
  }

  const lines = fs
    .readFileSync(recordPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error("No ledger records.");
  }

  const latest = JSON.parse(lines[lines.length - 1]);
  const required = ["gateLevel", "gateAction", "sparkRoute", "sparkAction", "min5hRatio", "oneWeekRatio"];
  for (const key of required) {
    if (latest[key] === undefined || latest[key] === null || latest[key] === "") {
      throw new Error(`Latest ledger missing: ${key}`);
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "PASS",
        checkedAt: latest.timestamp,
        gateLevel: latest.gateLevel,
        sparkRoute: latest.sparkRoute,
      },
      null,
      2,
    )}\n`,
  );
}

main();
