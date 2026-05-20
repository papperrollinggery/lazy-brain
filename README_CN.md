# LazyBrain

> 输入一次任务，LazyBrain 自动找到本机最合适的 AI capability，并生成确定性的编排计划。

![LazyBrain terminal demo](docs/assets/lazybrain-demo.svg)

## 问题

你装了很多 skills、commands、plugins 和本地规则。真正记得住、会主动调用的只有少数几个。LazyBrain 把这些能力重新变成一个可搜索、可编排、可验证的本地能力层。

## 安装

```bash
npx --yes lazybrain quickstart
npm install -g lazybrain
lb "review this PR for security issues"
```

从源码运行：

```bash
npm ci
npm run build
node dist/bin/lazybrain.js quickstart
```

## 常用命令

```bash
lb "审查这个 PR 有没有安全问题"          # 匹配最合适的能力
lb combo "deploy new feature to production" # 生成工作流模板
lb orchestrate "deploy payment feature"     # 生成多技能编排计划
lb stats                                    # 查看最近使用情况
lb discover                                 # 发现高价值但未使用的能力
lb scan && lb compile                       # 刷新本地能力图谱
lb config show                              # 查看脱敏后的本地配置
lazybrain-mcp                               # 启动 stdio MCP server
```

## 工作方式

```text
用户任务
  -> trigger / tag / example 匹配
  -> scan / compile 生成的本地图谱
  -> combo 模板和 orchestration rules
  -> CLI / hook / statusline 输出
```

核心路径是确定性的：匹配时不调用 LLM，不依赖 embedding，低置信度 hook 建议会保持静默。

## 支持的来源

LazyBrain 可以扫描或索引这些本地能力来源：

`Claude Code` `Codex` `Cursor` `Windsurf` `Cline` `OpenCode` `local SKILL.md`

默认覆盖 Claude skills/commands、项目 commands、Cursor/Windsurf/Cline 规则文件、`.skillshub`、`.codex/skills` 和 `.agents/skills`。

## 编排能力

`lb orchestrate` 会把一句任务升级成有顺序的执行计划：

```text
$ lb orchestrate "deploy payment feature"

Orchestration Plan 94%
payment/auth risk detected

1. /security-review
2. /tdd-workflow
3. /code-review
4. /ship

Sequence: sequential
Auto-activate: no
```

`lb combo` 用于返回可复用工作流模板：

```text
$ lb combo "deploy new feature to production"

Recommended workflow: release_public_audit
1. /document-release
2. /github-ops
3. /ci-cd-best-practices

Verification: npm run audit:public && npm pack --dry-run --json
```

## MCP Server

全局安装后：

```json
{
  "mcpServers": {
    "lazybrain": {
      "command": "lazybrain-mcp",
      "args": []
    }
  }
}
```

源码 checkout：

```json
{
  "mcpServers": {
    "lazybrain": {
      "command": "node",
      "args": ["/absolute/path/to/lazybrain/dist/bin/mcp.js"]
    }
  }
}
```

## Benchmark

仓库内可验证的指标：

| 指标 | 证据 |
| --- | --- |
| Golden set | `test/golden/find.test.ts` 中 76 条标注用例和 negative checks |
| Precision gate | 测试要求 top-match 精准率不低于 88% |
| Latency gate | 测试要求 100 次 `find()` 平均耗时低于 200ms |
| 内置匹配面 | `src/knowledge/builtin.ts` 中的核心技能和生成能力名 |
| 编排面 | `src/orchestrator/rules.ts` 中 18 条规则，`src/combos/registry.ts` 中 12 个 combo |
| 运行模型 | 确定性 matcher + rule engine；核心路径不调用运行时 LLM |

## 贡献方式

最小有效贡献：一个 trigger phrase 加一条 golden-set case。

1. 在 `src/knowledge/builtin.ts` 增加 trigger/example。
2. 在 `test/golden/find.test.ts` 增加标注查询。
3. 运行 `npm test`。

适合贡献的方向：触发词、combo 模板、编排规则、scanner 覆盖、benchmark cases。

## License

AGPL-3.0.
