# LazyBrain

> 本地优先的 AI agent capability 路由器。

![LazyBrain terminal demo](docs/assets/lazybrain-demo.svg)

LazyBrain 把一句自然语言任务映射到本机最合适的 skill、slash command、plugin、MCP 工具、工作流模板或编排计划。它解决的问题很直接：你装了很多能力，但不可能每次都记住准确命令名。

当前版本：`2.0.0`。

## 当前可用能力

| 使用面 | 状态 | 用途 |
| --- | --- | --- |
| CLI：`lb` / `lazybrain` | 可用 | 手动查能力、查 workflow、看 stats、刷新图谱 |
| Claude Code 项目 hook | 可用 | 每个项目安装一次，之后高置信度自动提示 |
| MCP：`lazybrain-mcp` | 可用 | 给支持 stdio MCP 的 agent 客户端调用 |
| 本地图谱/cache | 可用 | 基于本机 capability metadata 做快速确定性匹配 |
| Hosted dashboard | 未包含 | 当前 beta 没有云端 UI 或团队同步 |
| 自动执行任务 | 未包含 | LazyBrain 负责推荐和规划，执行仍由你的 agent 完成 |

## 安装

要求 Node.js 18 或更新版本。

从 npm 安装：

```bash
npm install -g lazybrain
lb quickstart
lb ready
```

Beta tag：

```bash
npm install -g lazybrain@beta
```

从源码安装：

```bash
git clone https://github.com/papperrollinggery/lazy-brain.git
cd lazy-brain
npm ci
npm run build
npm link
lb quickstart
lb ready
```

GitHub release tarball 兜底：

```bash
npm install -g https://github.com/papperrollinggery/lazy-brain/releases/download/v2.0.0/lazybrain-2.0.0.tgz
```

完整安装、旧版本清理、MCP 和 smoke test 说明见：[docs/INSTALL.md](docs/INSTALL.md)。

## 首次使用

安装后或本机 skills/rules 变化后跑一次：

```bash
lb quickstart
```

它会扫描本机支持的 capability 来源，并把本地图谱写到 `~/.lazybrain`。

想手动问“这个任务该用哪个能力”时：

```bash
lb "review this PR for security issues"
```

如果希望 Claude Code 在当前项目自动提示，项目里安装一次 hook：

```bash
lb hook install
lb hook status
```

装好以后，你不需要每次都敲 `lb`。在该项目里正常向 Claude Code 输入任务即可；低置信度时 LazyBrain 会保持静默。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `lb "task"` | 匹配最合适的 capability |
| `lb combo "task"` | 返回可复用 workflow 模板 |
| `lb orchestrate "task"` | 生成多 skill 编排计划 |
| `lb scan` | 扫描本机 capability 文件 |
| `lb compile` | 重建本地 capability 图谱 |
| `lb quickstart` | 首次使用的一键扫描和编译 |
| `lb stats` | 查看最近使用情况和模式 |
| `lb discover` | 发现高价值但未使用的本机能力 |
| `lb config show` | 查看脱敏后的本地配置 |
| `lb ready` / `lb ready --json` | 检查图谱和 hook 是否可用 |
| `lb hook plan` | 查看将要写入的 hook 变更 |
| `lb hook install` | 安装当前项目的 Claude Code hook |
| `lb hook uninstall` | 移除当前项目 hook |
| `lazybrain-mcp` | 启动 stdio MCP server |

示例：

```text
$ lb "review this PR for security issues"

/security-review 98%
Scan code for OWASP Top 10, auth bypass, injection, and credential exposure.

Also consider:
- /code-review
- /gitnexus-pr-review
```

## MCP

给支持 MCP 的客户端添加：

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

源码 checkout 版本：

```json
{
  "mcpServers": {
    "lazybrain": {
      "command": "node",
      "args": ["/absolute/path/to/lazy-brain/dist/bin/mcp.js"]
    }
  }
}
```

当前 MCP tools：

| Tool | 用途 |
| --- | --- |
| `lazybrain_find` | 为任务匹配能力 |
| `lazybrain_orchestrate` | 生成编排计划 |
| `lazybrain_stats` | 读取本地使用统计 |
| `lazybrain_scan` | 扫描本机 capability 来源 |

Smoke test：

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n' | lazybrain-mcp
```

## 支持的来源

`lb quickstart`、`lb scan`、`lb compile` 会读取常见 agent 工具目录里的本地 capability metadata：

- Claude Code skills 和 commands
- Codex skills
- 项目 `.claude/commands`
- `.skillshub`
- `.codex/skills`
- `.agents/skills`
- Cursor、Windsurf、Cline、OpenCode 规则文件
- 本地 `SKILL.md` 风格的能力文件

空机器也能用，因为 LazyBrain 内置了一组常见开发 workflow capability。

## 如何保证建议可靠

LazyBrain 的核心路径是确定性的：

- 正常匹配不调用运行时 LLM
- 正常匹配不依赖 embedding
- hook 低置信度建议保持静默
- golden-set 测试覆盖 76 条标注路由用例和 negative cases
- precision gate 要求 top-match 精准率至少 88%
- latency gate 要求 `find()` 平均耗时低于 200ms

验证命令：

```bash
npm run lint
npm test
npm run build
npm run audit:public
npm pack --dry-run --json
```

## 隐私边界

LazyBrain 是 local-first。它扫描本机 capability metadata，把 cache/history 写到 `~/.lazybrain`。它不会上传扫描文件，不要求云账号，也不发送 telemetry。

详情见：[docs/PRIVACY.md](docs/PRIVACY.md)。

## Beta 适用场景

适合：

- 本机 AI 工具重度用户
- 有大量 skills、prompts、rules、commands、plugins 的团队
- agent workflow 作者
- 想要确定性路由、不想在核心路径调用运行时 LLM 的开发者

暂不适合：

- 期待 LazyBrain 自动执行完整任务的用户
- 需要 hosted team dashboard 的用户
- 需要跨机器同步的用户
- 需要托管云端 telemetry 或 analytics 的用户

## 文档

- [安装](docs/INSTALL.md)
- [使用场景](docs/USE_CASES.md)
- [隐私](docs/PRIVACY.md)
- [发布检查](docs/RELEASE_CHECKLIST.md)

## 贡献

最小有效 PR：一个 trigger phrase 加一条 golden-set case。

1. 在 `src/knowledge/builtin.ts` 添加 trigger/example。
2. 在 `test/golden/find.test.ts` 添加标注查询。
3. 运行 `npm test`。

适合贡献的方向：触发词、combo 模板、编排规则、scanner 覆盖、benchmark cases。

## License

AGPL-3.0.
