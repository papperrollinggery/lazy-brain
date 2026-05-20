# LazyBrain Project

语义技能路由器 / AI 编程助手附属性智能体。扫描本地 skill/agent/command，编译知识图谱，匹配用户意图到最佳能力。

## 首次安装（模型照做即可）

本文件是给 AI 模型看的项目手册。如果你刚进入这个项目，按下面流程安装：

### 环境检查
```bash
node --version          # 必须 >= 18
```

### 构建
```bash
npm install
npm run build
npm link                # 注册 lazybrain / lb 全局命令
lazybrain --version     # 验证：应输出版本号
```

### 扫描 + 编译图谱
```bash
lazybrain scan

# 离线编译（不需要 API，只有 similar_to 边）
lazybrain compile --offline

# 完整编译（需要 API，生成全部关系类型）
lazybrain api test                        # 先测 API 是否通
lazybrain compile --with-relations        # LLM 推理 composes_with/depends_on/supersedes

lazybrain ready         # 验证：graph 应显示 OK
```

> **重要：** `compile --with-relations` 之前必须先 `api test`。API 不通时编译会静默降级为离线模式，图谱关系边只有 similar_to。

### 安装 Claude Code hook
```bash
lazybrain hook plan     # 预览改动
lazybrain hook install  # 安装（默认 project scope）
# 如果已有 HUD（claude-hud），用 --statusline 组合模式：
# lazybrain hook install --statusline
lazybrain hook status   # 验证：UserPromptSubmit 应显示已安装
```

### 验证
重启 Claude Code 后，状态栏应显示 `🧠 待机中`（灰色/dim）。输入复杂任务时应看到路由建议。

### 卸载/回滚
```bash
lazybrain hook rollback
lazybrain hook uninstall
```

## 关键文件

| 文件 | 用途 |
|------|------|
| `bin/statusline.ts` | 状态栏显示，活跃态 bold，休眠态 dim |
| `bin/statusline-combined.ts` | 组合 HUD 的状态栏 wrapper |
| `bin/hook.ts` | Claude Code UserPromptSubmit hook |
| `bin/lazybrain.ts` | CLI 主入口 |
| `src/` | 核心库：scanner, compiler, graph, matcher, route-gate |
| `~/.lazybrain/` | 运行时数据目录（graph.json, last-match.json 等） |

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **lazy-brain** (3579 symbols, 10214 relationships, 267 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/lazy-brain/context` | Codebase overview, check index freshness |
| `gitnexus://repo/lazy-brain/clusters` | All functional areas |
| `gitnexus://repo/lazy-brain/processes` | All execution flows |
| `gitnexus://repo/lazy-brain/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
