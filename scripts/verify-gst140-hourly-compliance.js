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

function parseRecords(recordPath) {
  const lines = fs
    .readFileSync(recordPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line, idx) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSONL at line ${idx + 1}: ${error.message}`);
    }
  });
}

function assertRequiredFields(record) {
  const required = [
    "timestamp",
    "gateLevel",
    "gateAction",
    "sparkRoute",
    "rollbackCount",
    "deferredTaskCount",
    "min5hRatio",
    "oneWeekRatio",
    "post",
  ];
  for (const key of required) {
    if (record[key] === null || record[key] === undefined || record[key] === "") {
      throw new Error(`Missing required field: ${key}`);
    }
  }
}

function assertCadence(latestTwo, maxGapMinutes) {
  if (latestTwo.length < 2) {
    throw new Error("Need at least 2 records for cadence validation.");
  }
  const [prev, curr] = latestTwo;
  const prevAt = new Date(prev.timestamp).getTime();
  const currAt = new Date(curr.timestamp).getTime();
  if (Number.isNaN(prevAt) || Number.isNaN(currAt)) {
    throw new Error("Invalid timestamp in latest records.");
  }
  const gapMinutes = (currAt - prevAt) / (1000 * 60);
  if (gapMinutes > maxGapMinutes) {
    throw new Error(`Cadence failed: ${gapMinutes.toFixed(1)}m > ${maxGapMinutes}m.`);
  }
  return gapMinutes;
}

function main() {
  const args = parseArgs(process.argv);
  const recordPath = args.record ?? "docs/GST-140-hourly-comment-records.jsonl";
  const maxGapMinutes = Number(args.maxGapMinutes ?? 65);

  const records = parseRecords(recordPath);
  if (records.length < 2) {
    throw new Error(`Only ${records.length} record(s); requires at least 2.`);
  }

  const latestTwo = records.slice(-2);
  for (const record of latestTwo) {
    assertRequiredFields(record);
  }
  const gapMinutes = assertCadence(latestTwo, maxGapMinutes);

  const summary = {
    totalRecords: records.length,
    validatedRecords: latestTwo.length,
    cadenceGapMinutes: Number(gapMinutes.toFixed(1)),
    status: "PASS",
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main();
