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
  const rollupPath = args.rollup ?? "docs/GST-140-hourly-rollup.md";

  if (!fs.existsSync(rollupPath)) {
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "SKIP",
          reason: "rollup_not_found",
          path: rollupPath,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const content = fs.readFileSync(rollupPath, "utf8");
  const ok = content.includes("GST-140") && content.includes("阈值门禁");
  if (!ok) {
    throw new Error(`Rollup exists but lacks required markers: ${rollupPath}`);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "PASS",
        path: rollupPath,
      },
      null,
      2,
    )}\n`,
  );
}

main();
