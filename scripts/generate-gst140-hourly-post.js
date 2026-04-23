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

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function evaluateGate(quota) {
  const pools = Array.isArray(quota.pools) ? quota.pools : [];
  const fiveHourPools = pools.filter((pool) => pool.window === "5h");
  const weeklyPools = pools.filter((pool) => pool.window === "1w");
  if (fiveHourPools.length === 0) {
    throw new Error("Missing 5h pools in quota input.");
  }
  if (weeklyPools.length === 0) {
    throw new Error("Missing 1w pools in quota input.");
  }

  const min5hRatio = fiveHourPools.reduce((min, pool) => {
    const ratio = pool.total > 0 ? pool.remaining / pool.total : 0;
    return Math.min(min, ratio);
  }, 1);

  const oneWeekRatio = weeklyPools.reduce((min, pool) => {
    const ratio = pool.total > 0 ? pool.remaining / pool.total : 0;
    return Math.min(min, ratio);
  }, 1);

  let gateLevel = "NORMAL";
  let gateAction = "维持默认执行池";
  if (min5hRatio < 0.1) {
    gateLevel = "P0_ONLY";
    gateAction = "仅运行 P0，暂停 P1/P2/P3";
  } else if (min5hRatio < 0.2) {
    gateLevel = "LOW_COST";
    gateAction = "自动降级到低成本模型";
  }

  return {
    min5hRatio,
    oneWeekRatio,
    gateLevel,
    gateAction,
    triggered: gateLevel !== "NORMAL",
  };
}

function evaluateSparkWindow(nowIso, sparkResumeAtIso) {
  const now = new Date(nowIso);
  const resume = new Date(sparkResumeAtIso);
  if (Number.isNaN(now.getTime()) || Number.isNaN(resume.getTime())) {
    throw new Error("Invalid time input for spark window evaluation.");
  }
  return now < resume
    ? { sparkEnabled: false, sparkRoute: "STOPPED", sparkAction: "Spark 停路由" }
    : {
        sparkEnabled: true,
        sparkRoute: "T0_T1_BATCH",
        sparkAction: "Spark 恢复承接 T0/T1 批量",
      };
}

function formatPoolSummary(pools, window) {
  return pools
    .filter((pool) => pool.window === window)
    .map((pool) => {
      const ratio = pool.total > 0 ? pool.remaining / pool.total : 0;
      return `${pool.name}:${pool.remaining}/${pool.total} (${pct(ratio)})`;
    })
    .join("；");
}

function buildPost({ nowIso, issueId, quota, gate, spark }) {
  const pools = Array.isArray(quota.pools) ? quota.pools : [];
  const fiveHour = formatPoolSummary(pools, "5h");
  const oneWeek = formatPoolSummary(pools, "1w");
  const rollbackCount = Number(quota.rollbackCount ?? 0);
  const deferredTaskCount = Number(quota.deferredTaskCount ?? 0);
  const triggerText = gate.triggered ? "是" : "否";

  const lines = [
    `### GST-140 每60分钟回贴 (${nowIso})`,
    `- Issue: ${issueId}`,
    `- 5h 余量: ${fiveHour}`,
    `- 1w 余量: ${oneWeek}`,
    `- 回退次数: ${rollbackCount}`,
    `- 被延后任务数: ${deferredTaskCount}`,
    `- 阈值门禁触发: ${triggerText}`,
    `- 门禁等级: ${gate.gateLevel}`,
    `- 门禁动作: ${gate.gateAction}`,
    `- Spark 路由状态: ${spark.sparkRoute}`,
    `- Spark 动作: ${spark.sparkAction}`,
    "- 可追溯字段: min5hRatio, oneWeekRatio, gateLevel, gateAction, sparkRoute",
  ];

  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = args.input;
  if (!inputPath) {
    throw new Error("Missing --input <quota.json>");
  }
  const outputPath = args.output ?? "tmp/gst140-hourly-post.md";
  const nowIso = args.now ?? new Date().toISOString();
  const sparkResumeAt = args.sparkResumeAt ?? "2026-04-23T13:32:00+08:00";
  const issueId = args.issueId ?? "GST-134";

  const inputRaw = fs.readFileSync(inputPath, "utf8");
  const quota = JSON.parse(inputRaw);
  const gate = evaluateGate(quota);
  const spark = evaluateSparkWindow(nowIso, sparkResumeAt);
  const post = buildPost({ nowIso, issueId, quota, gate, spark });

  const artifact = {
    issueId,
    nowIso,
    gate,
    spark,
    rollbackCount: Number(quota.rollbackCount ?? 0),
    deferredTaskCount: Number(quota.deferredTaskCount ?? 0),
    pools: quota.pools ?? [],
    post,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${post}\n`, "utf8");
  process.stdout.write(JSON.stringify(artifact, null, 2));
}

main();
