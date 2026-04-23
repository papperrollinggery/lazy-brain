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

function readLatestRecord(recordPath) {
  const lines = fs
    .readFileSync(recordPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error(`No records found: ${recordPath}`);
  }
  return JSON.parse(lines[lines.length - 1]);
}

function buildComment(latest) {
  return [
    `### GST-140 每60分钟回贴（${latest.timestamp}）`,
    `- 5h/1w 余量：见本条记录字段（min5hRatio=${latest.min5hRatio}, oneWeekRatio=${latest.oneWeekRatio})`,
    `- 回退次数：${latest.rollbackCount}`,
    `- 被延后任务数：${latest.deferredTaskCount}`,
    `- 阈值门禁触发：${latest.gateLevel === "NORMAL" ? "否" : "是"}`,
    `- 门禁等级：${latest.gateLevel}`,
    `- 门禁动作：${latest.gateAction}`,
    `- Spark 路由状态：${latest.sparkRoute}`,
    `- Spark 动作：${latest.sparkAction}`,
    `- 可追溯证据：docs/GST-140-hourly-comment-records.jsonl`,
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  const recordPath = args.record ?? "docs/GST-140-hourly-comment-records.jsonl";
  const outputPath = args.output ?? "docs/GST-140-latest-comment-ready.md";
  const latest = readLatestRecord(recordPath);
  const content = buildComment(latest);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${content}\n`, "utf8");
  process.stdout.write(`${outputPath}\n`);
}

main();
