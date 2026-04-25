<div align="center">

# 🧠 LazyBrain

**AI 编程助手的语义技能路由器 / 附属性智能体**

[![CI](https://github.com/papperrollinggery/lazy-brain/actions/workflows/ci.yml/badge.svg)](https://github.com/papperrollinggery/lazy-brain/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](https://nodejs.org)

> 一个贴在主模型旁边的附属性智能体，把零散工具库变成可理解、可路由、可表达的能力层。  
> 扫描能力、编译图谱、按意图路由，并且不参与 `Stop` 生命周期竞争。

[English](README.md) | [中文文档](README_CN.md)

---

</div>

## 当前版本

当前版本：**v1.2.0**

发布定位：**公开安全 beta 版**。这一版适合做本地可信评估、非安装式推荐测试、project-scoped Claude Code hook 安装。Hook 安全链路已经适合公开 beta；推荐质量、semantic cache 覆盖、自动别名提升仍在继续优化。

## 项目概览

在现代 AI 编码环境里，真正的问题通常已经不是“能力不够”，而是：

- skill 太多，记不住名字
- agent 太多，不知道什么时候该叫谁
- command 太多，入口碎片化
- 多个插件重叠，但没有统一路由层
- 中英文混输时，匹配效果不稳定

LazyBrain 的角色不是替代主模型，而是作为一个**附属性智能体（sidecar agent）**，贴在主模型旁边，负责：

- 扫描本地能力面
- 编译能力图谱
- 在输入时做意图路由
- 在启动时做轻量回顾
- 避免和记忆/通知插件争抢 `Stop` 生命周期

## 为什么要有它

如果没有路由层，高级 AI 编码环境通常会退化成这样：

- 明明装了很多能力，但几乎不用
- 中文需求匹配不到英文能力名
- 用户被迫自己决定模式和工具
- 花了很多时间在“找入口”，而不是“推进任务”

LazyBrain 的目标，就是把零散工具库整理成一个可路由、可解释、可成长的能力层。

```
你输入: "帮我审查这个 PR"
LazyBrain: → /review-pr (92%) | /critic (78%) | /santa-loop (71%)
           ✅ 自动注入 /review-pr 到上下文
```

## 核心特性

- **意图优先**：用户描述目标，不需要记命令名
- **能力无关**：覆盖 skill、agent、command、mode、hook
- **中英双语**：中文和英文查询都作为一等输入处理
- **本地优先**：scan、graph、wiki、tag-layer 都依赖本地产物
- **副驾驶生命周期**：默认只接 `UserPromptSubmit`，可选 `SessionStart`，不依赖 `Stop`

## 推荐公开使用流程

公开用户默认走这条路径：

```bash
lazybrain scan
lazybrain compile --offline
lazybrain ready
lazybrain server --daemon
open http://127.0.0.1:18450/lab
lazybrain hook plan
lazybrain hook install
```

安全默认值：

- Lab 不安装 hook，不写 `.claude/settings.json`
- `hook plan` 只预演
- `hook install` 默认 project scope，并且先备份
- 全局安装必须显式使用 `lazybrain hook install --global --yes`
- LazyBrain 不把 `Stop` 当作产品生命周期
- 默认保留第三方 hook 和 HUD/statusline

## 什么会被当成技能 / Agent / Capability

LazyBrain 把本机 AI 工具体系统一看成 **capability**。一个 capability 可以是：

- 带 `SKILL.md` 的 skill 目录
- Claude / Agent Agency 的 agent markdown 文件
- command markdown 文件
- mode、hook 或插件扫描出来的能力入口

对 skill，LazyBrain 会读取：

- frontmatter 里的 `name`、`description`、`trigger`、`triggers`、`origin`
- 没有 description 时，用正文第一个有效段落作为 fallback
- 没有 name 时，用父目录名作为 fallback

对 agent，Lab 只展示公开 metadata：

- `name`
- `description`
- `scope`
- `source`
- `model`
- `tools`

Lab 不返回 agent 正文，不读取 Claude 私人 transcript，也不读取历史对话。scan/compile 会解析本地 markdown 来建图，但不会执行 skill 或 agent。

推荐的 skill 写法：

```markdown
---
name: code-review
description: Review code for correctness, regressions, maintainability, and missing tests.
triggers:
  - review code
  - 审查代码
---

Use this skill when the user asks for a focused engineering review.
```

如果某个 skill 没被扫到，先确认它在已扫描路径下，有 `SKILL.md`，并且有清晰的 `name` 或 `description`。

## 已实现 / 规划中

| 能力 | 当前状态 | 说明 |
|------|----------|------|
| 离线路由 | 已实现 | 手工别名 + tag/CJK bridge，无 API key 也可用 |
| semantic / hybrid | 条件可用 | 需要 embedding 配置和 `graph.embeddings.*` 缓存；缺失时降级并提示 |
| hook 安装 | 已实现 | project 默认、plan dry-run、备份、rollback、global 需 `--yes` |
| Lab | 已实现 | 内置样例、本机 agent metadata、team gate、token 策略、hook readiness |
| Team 建议 | 已实现为 advisory | 给模型/agent/prompt 建议，最终决定权在主模型或用户 |
| 自动别名 | 规划中 | 当前是建议/只读路径，不宣称完全成熟 |

## Wiki 与图谱产物

`lazybrain compile` 会把运行时产物写到 `~/.lazybrain/` 下。这些是你本机的图谱和知识文件，不是仓库源码的一部分。

```
~/.lazybrain/wiki/
├── index.md
├── kinds.md
├── origins.md
├── development.md
├── operations.md
└── ...
```

要点：

- 分类页来自**固定分类体系 + 本地动态归类**
- 最终分类数量取决于本机实际扫描到的能力
- README 里的数量如果出现，只是示例，不是固定事实
- wiki 覆盖的是 capability，包括 skill、agent、command、mode、hook
- agent 和 command 当前收在分类页内部，也可以通过 `kinds.md`、`origins.md` 查看

## 怎么用？（先测试，再安装）

**环境要求**：Node.js ≥ 18

### 第 1 步：安装

```bash
# 从 GitHub 安装（npm 发布中）
git clone https://github.com/papperrollinggery/lazy-brain.git
cd lazy-brain
npm install
npm run build
npm link        # 注册 lazybrain / lb 到全局
```

### 第 2 步：扫描 + 编译

```bash
lazybrain scan        # 找到你电脑上所有工具
lazybrain compile --offline  # 无 API key 也能先用 tag-layer
```

编译完成后，LazyBrain 就知道你有哪些工具、每个工具是干嘛的了。

### 第 3 步：检查 + Lab 预览

```bash
lazybrain ready       # 检查图谱、hook、HUD、semantic 配置
lazybrain server --daemon
open http://127.0.0.1:18450/lab
```

Lab 会用内置样例检查推荐质量、team gate、token 策略、hook 安全状态和本机 Claude/Agent Agency 子智能体映射。它不安装 hook，不写 `.claude/settings.json`，也不读取 Claude 私人 transcript。

### 第 4 步：预演 + 安装到 Claude Code

```bash
lazybrain hook plan   # 只预演，不写 settings
lazybrain hook install

# 显式全局安装（不推荐）
# lazybrain hook install --global --yes
```

`hook install` 默认只写当前项目的 `.claude/settings.json`。全局安装必须显式加 `--yes`。

从当前版本开始，`lazybrain hook install` 只安装：

- `UserPromptSubmit`

它会自动清理旧版本残留的 LazyBrain `Stop` 注册，不再让 LazyBrain 参与 `running stop hooks`。

安装前会自动备份 LazyBrain 触达的配置。需要回滚时：

```bash
lazybrain hook rollback
```

安装后，你在**当前记录的项目工作区里**使用 Claude Code/CLI 时，LazyBrain 就会自动帮你匹配工具：

```
你说: "帮我审查代码"
LazyBrain: → 推荐 /review-pr (92%)
           ✅ 已自动加载

你说: "这个 bug 怎么修"
LazyBrain: → 推荐 /debugger (88%)
           ✅ 已自动加载

你说: "我想部署到服务器"
LazyBrain: → 推荐 /DevOps Automator (85%)
           ✅ 已自动加载
```

你不需要记任何命令，**说话就行**。

## 日常使用方式

公开版推荐这样用：

```bash
lazybrain --version                  # 确认版本
lazybrain scan                       # 刷新本地能力
lazybrain compile --offline          # 无 API key 构建基础图谱
lazybrain match "帮我审查这个 PR"      # 在终端测试推荐质量
lazybrain ready                      # 检查图谱、hook、HUD、semantic 状态
lazybrain server --daemon            # 启动本地 Lab
lazybrain hook plan                  # 预览 hook 改动
lazybrain hook install               # 安装 project scope hook
```

安装 hook 前，先用 Lab 直观看效果：

```bash
open http://127.0.0.1:18450/lab
```

如果安装后效果不符合预期，直接回滚：

```bash
lazybrain hook rollback
lazybrain hook status
```

## 它是怎么做到的？

LazyBrain 有三个阶段，全自动运行：

```
你装的工具 ──scan──▶ 知识图谱 ──compile──▶ 你说话 ──hook──▶ 自动推荐
(几十个Skill)     (AI理解每个    (每个工具有了      (匹配你的
                  工具是干嘛的)    标签和关系)       意图)
```

**扫描 (scan)**：找到你电脑上所有的 Skill、Agent、命令
**编译 (compile)**：离线生成基础图谱；配置 LLM 后可生成更丰富的标签和关系
**挂钩 (hook)**：装进 Claude Code，每次你输入时自动匹配

## 匹配引擎：当前实现

你输入一句话后，LazyBrain 会按顺序查找最合适的工具：

```
你输入: "帮我审查这个 PR"
    │
    ▼
┌──────────────────────────────────────────┐
│  第 1 层：别名                            │
│  你之前设过快捷方式吗？                    │
│  比如 "review" 直接跳到 /review-pr       │
│  ⚡ 0ms，瞬间命中                        │
└──────────────┬───────────────────────────┘
               │ 没有
               ▼
┌──────────────────────────────────────────┐
│  第 2 层：标签匹配                        │
│  "审查" → 扩展为 ["review", "audit"]      │
│  然后找带这些标签的工具                    │
│  ⚡ <1ms，不需要网络                     │
└──────────────┬───────────────────────────┘
               │ 拿不准
               ▼
┌──────────────────────────────────────────┐
│  第 3 层：语义向量（semantic/hybrid）      │
│  需要 embedding 配置和缓存可用             │
│  缓存缺失或过期时会降级并给 warning        │
└──────────────┬───────────────────────────┘
               │ 还是拿不准
               ▼
┌──────────────────────────────────────────┐
│  第 4 层：AI 秘书（Claude hook 内）        │
│  让 AI 再想一遍："用户到底想要什么？"      │
│  只在 hook 低置信路径启动                 │
│  ⚡ ~2s，需要联网                        │
└──────────────────────────────────────────┘
```

**简单理解**：先看手工别名 → 再看关键词 → 低置信时补语义 → hook 内再用 Secretary 判断。

**离线也能用**：别名和 tag-layer 不需要网络；semantic/hybrid 需要 embedding 配置与缓存。

## 越用越聪明：四种进化能力

LazyBrain 不只是帮你找工具，它会从你的使用习惯中学习：

**1. 拒绝学习** — 你拒绝的推荐，下次自动降权

```
你说 "审查代码" → LazyBrain 推荐 /wiki → 你没选
下次再说 "审查代码" → /wiki 排名自动下降
```

**2. 自动别名（规划中）** — 重复的选择变成快捷方式

```
你说 "审查代码" → 选了 /code-review → 连续 3 次
后续版本会把稳定重复选择提升为快捷方式
```

**3. 标签进化** — 从你的搜索中学新词

```
你搜 "审查代码" → 系统发现 "审查" 不在标签里
运行 lazybrain evolve → 自动给相关工具加上 "审查" 标签
以后搜 "审查" 就能命中了
```

**4. 任务链预判** — 用完 A，推荐 B

```
你刚用了 /review-pr（审查代码）
LazyBrain: "通常审查完会重构，要不要用 /refactor-clean？"
```

## 知识图谱长什么样？

编译完成后，LazyBrain 会建一张知识图谱。每个工具是一个节点，工具之间的关系是连线：

```
  /review-pr ──depends_on──▶ /coding-standards
      │
      ├──similar_to──▶ /code-reviewer
      │
      ├──composes_with──▶ /refactor-clean
      │
      └──similar_to──▶ /critic
```

**三种关系**：
- **depends_on**（依赖）：用 A 之前需要先有 B
- **similar_to**（相似）：A 和 B 功能相近，区别是什么
- **composes_with**（组合）：A + B 一起用效果更好

## 百科 (Wiki)

`lazybrain wiki` 会基于当前图谱生成一组本地 capability 文档，不是“查询单个工具说明”的在线命令。

当前 wiki 结构包含三种入口：

- `index.md`：总索引
- `kinds.md`：按 `skill / agent / command / mode / hook` 聚合
- `origins.md`：按 `local / ECC / OMC / plugin / external` 等来源聚合
- `*.md` 分类页：按固定分类体系聚合，并在页内分成 `Skills / Agents / Commands / Other`

生成后会写到 `~/.lazybrain/wiki/`：

```
~/.lazybrain/wiki/
├── index.md           # 总目录
├── kinds.md           # 按 capability 类型索引
├── origins.md         # 按来源索引
├── code-quality.md    # 代码质量类
├── development.md     # 开发类
├── deployment.md      # 部署类
├── security.md        # 安全类
├── design.md          # 设计类
└── ...
```

## 完整命令列表

| 命令 | 说明 |
|------|------|
| `lazybrain scan` | 扫描本地所有工具 |
| `lazybrain compile` | 编译知识图谱（需要 API key） |
| `lazybrain compile --offline` | 离线编译（不需要 API key） |
| `lazybrain match "你的话"` | 测试匹配效果 |
| `lazybrain list` | 列出所有工具 |
| `lazybrain wiki` | 生成本地 wiki 目录与索引 |
| `lazybrain stats` | 图谱统计 |
| `lazybrain ready` | 检查是否可安全安装或使用 |
| `lazybrain server --daemon` | 启动本地 API 和 Lab 页面 |
| `lazybrain suggest-aliases` | 查看建议的快捷方式 |
| `lazybrain evolve` | 从使用中学习新标签 |
| `lazybrain evolve --dry-run` | 预览学习结果（不实际修改） |
| `lazybrain evolve --rollback` | 撤销上次学习 |
| `lazybrain hook plan` | 预演 Hook 安装，不写文件 |
| `lazybrain hook install` | 安装 Hook（默认 project scope） |
| `lazybrain hook install --global --yes` | 显式确认后全局安装 |
| `lazybrain hook rollback` | 回滚最近一次 LazyBrain hook 安装 |
| `lazybrain hook uninstall` | 卸载 |
| `lazybrain hook status` | 检查 LazyBrain 是否仍参与 `Stop` |
| `lazybrain hook ps` | 查看当前活跃 hook |
| `lazybrain hook clean` | 清理失效 runtime 记录 |
| `lazybrain doctor` | 诊断 LazyBrain 运行状态 |
| `lazybrain doctor --fix` | 修复 LazyBrain 自身状态漂移 |
| `lazybrain doctor --all` | 同时检查 project/global，不执行修复 |
| `lazybrain config list` | 查看配置 |
| `lazybrain config set <键> <值>` | 修改配置 |

## Lab：非安装式可视化测试

```bash
lazybrain server --daemon
open http://127.0.0.1:18450/lab
```

Lab 用内置样例检查匹配质量、team gate、token 策略、hook 安全状态和 Claude/Agent Agency 子智能体映射；不会安装 hook，也不会写 `.claude/settings.json`。

Lab API：

- `GET /lab`：本地无依赖页面
- `GET /lab/fixtures`：内置评估样例
- `GET /lab/agents`：只返回本机 agent metadata：名称、描述、scope、source、model、tools
- `POST /lab/evaluate`：返回 match、team 建议、runtime adapters、token 策略、hook readiness 和 warnings

agent inventory 不返回 agent 正文，也不读取 Claude 私人 transcript。

## Hook 安全模型

- `lazybrain hook install` 默认是 **project scope**
- `lazybrain hook plan` 只预演，不写 `.claude/settings.json` 或 `~/.lazybrain/*`
- `lazybrain hook install` 会先创建 LazyBrain 备份，再写入配置
- `lazybrain hook rollback` 只恢复 LazyBrain 自动备份过的文件
- `lazybrain hook install --global` 必须加 `--yes`
- LazyBrain 只会在记录的项目根目录下工作
- 其他 cwd 的调用会直接 no-op 跳过
- `Stop` 仍然不属于产品生命周期
- 默认不覆盖第三方 HUD；如需同时显示，使用 `lazybrain hook install --statusline`
- `doctor --fix` 只修 LazyBrain 自身状态：
  - 规范化 hook 注册
  - 清理 stale runtime 记录
  - 清除 breaker 状态
  - 在已有 metadata 前提下修复 install metadata
- `doctor --fix` 不会自动修改第三方插件，也不会改系统服务
- `doctor --all --fix` 被禁用，避免一次性误改多个 scope

## 卸载与回滚

```bash
lazybrain hook uninstall
lazybrain hook rollback
lazybrain hook rollback --to <timestamp>
```

rollback 只恢复 LazyBrain 自动备份过的文件，不删除第三方 hook 文件。

## 默认不会做什么

- 不默认安装全局 hook
- 不参与 `Stop`
- 不删除第三方 hook
- 不覆盖第三方 HUD
- 不在 `hook plan` 中写任何配置文件
- 不在 semantic cache 缺失时假装 semantic 已启用

## 常见问题与故障处理

| 现象 | 先检查 | 处理方式 |
|------|--------|----------|
| `lazybrain ready` 提示 graph 缺失 | `~/.lazybrain/graph.json` 不存在 | 运行 `lazybrain scan && lazybrain compile --offline` |
| Lab 页面打不开 | server 没启动或端口不对 | 运行 `lazybrain server --daemon`，打开 `http://127.0.0.1:18450/lab` |
| Lab 没有 agent | 没找到可读 agent metadata | 在 `.claude/agents/` 或 `~/.claude/agents/` 放 agent，再刷新 Lab |
| `hook plan` 因 LazyBrain 残留在 `Stop` 显示 `needs_attention` | 老版本 Hook 注册残留 | 先看 plan；`lazybrain hook install` 会清理 LazyBrain 自己的 `Stop` 残留 |
| `hook install --global` 失败 | 全局安装需要显式确认 | 只有确认影响所有 Claude 项目时，才用 `lazybrain hook install --global --yes` |
| hook 已安装但没有推荐 | workspace guard、graph 缺失或匹配置信度低 | 运行 `lazybrain ready`、`lazybrain hook status`，再用 `lazybrain match "<同一句话>"` 对照 |
| 长时间无输出后 hook 像是卡住 | breaker 或 stale runtime record 可能存在 | 运行 `lazybrain hook ps`、`lazybrain hook clean`、`lazybrain ready` |
| 已有第三方 HUD/statusline | LazyBrain 默认跳过 | 需要组合时用 `lazybrain hook install --statusline`；确认替换时才用 `--replace-statusline` |
| semantic/hybrid 没效果 | embedding 配置或缓存缺失 | 配置 embedding 后重新编译；或者继续使用离线 tag-layer |
| 某个 skill 没出现在结果里 | 路径或 metadata 不完整 | 确认有 `SKILL.md`，包含 `name` 或 `description`，然后运行 `lazybrain scan` |

安全恢复命令：

```bash
lazybrain ready
lazybrain hook status
lazybrain hook ps
lazybrain hook clean
lazybrain hook rollback
lazybrain doctor
```

`doctor --fix` 只修当前 scope 下 LazyBrain 自己的状态。`doctor --all --fix` 被禁用，避免误改全局。

## 启动回顾（SessionStart）

LazyBrain 默认只依赖 `UserPromptSubmit`。如果你希望在打开新会话时看到一段轻量启动回顾，可以额外配置 `SessionStart`：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "command": "node",
        "args": ["${CLAUDE_CONFIG_DIR}/../../.local/lib/node_modules/lazybrain/dist/bin/hook.js"]
      }
    ]
  }
}
```

启动回顾会展示：

- 最近推荐次数
- 接受率 / 跳过率
- 最近一次主要推荐
- 最近常用能力
- 重复能力提示
- 当前生命周期说明

它不会做这些事：

- 不依赖 `Stop`
- 不重解析 transcript
- 不调用 LLM 做总结
- 不和别的插件争抢会话结束阶段

如果你要确认当前环境里 LazyBrain 是否已经完全退出 `Stop`，直接运行：

```bash
lazybrain hook status
```

你会看到类似：

```text
UserPromptSubmit: ✅ 已安装
Stop: ✅ 无 LazyBrain 注册
SessionStart: ℹ️ 无 LazyBrain 注册
```

## 配置

第一次使用可以先离线编译；需要 LLM 编译或 semantic/hybrid 时再配置 API key：

```bash
# 必需：编译用 LLM
lazybrain config set compileApiBase https://api.siliconflow.cn/v1
lazybrain config set compileApiKey  <你的key>
lazybrain config set compileModel   Qwen/Qwen3-235B-A22B-Instruct-2507

# 可选：语义搜索。需要 embedding 配置和 graph.embeddings.* 缓存可用。
lazybrain config set embeddingApiKey  <你的key>
lazybrain config set embeddingApiBase https://api.siliconflow.cn/v1
lazybrain config set embeddingModel   BAAI/bge-m3
lazybrain config set engine           hybrid

# 可选：AI 秘书
lazybrain config set secretaryApiKey  <你的key>
lazybrain config set secretaryModel   Qwen/Qwen2.5-7B-Instruct

# 界面模式
lazybrain config set mode auto        # 静默自动注入
# lazybrain config set mode ask       # 弹窗让你选
```

推荐用 [SiliconFlow](https://siliconflow.cn)，注册送免费额度，bge-m3 embedding 免费用。

配置文件位置：`~/.lazybrain/config.json`

`lazybrain config show` 会对 API key 做脱敏展示。

## 数据都在哪？

```
~/.lazybrain/
├── config.json           # 你的配置
├── graph.json            # 知识图谱（你本机当前扫描出来的能力图谱）
├── graph.embeddings.bin  # 语义向量缓存
├── history.jsonl         # 使用记录（进化功能的数据源）
├── profile.json          # 你的使用画像
├── last-match.json       # 最近一次匹配结果
└── wiki/                 # capability 文档（index/kinds/origins + 分类页）
```

## 性能基准

| 模式 | Top-1 | Top-3 |
|------|-------|-------|
| 完整流水线（联网） | 取决于本地图谱与评测集 | 取决于本地图谱与评测集 |
| 仅标签（断网） | 反映本地基础匹配能力 | 反映本地基础匹配能力 |

基准结果会受到这些因素影响：

- 你当前机器上实际扫描到了哪些能力
- 你用的是离线 compile 还是 LLM compile
- Secretary / governance 等高层是否开启
- 使用的评测集是什么

## 许可证

MIT
