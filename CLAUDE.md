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
lazybrain compile --offline
lazybrain ready         # 验证：graph 应显示 OK
```

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
