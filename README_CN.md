<div align="center">

# 🧠 LazyBrain

**AI 编程助手的语义技能路由器**

> 你装了几十个 Skill，但每次都忘了该用哪个。
> LazyBrain 让你只管说话，它帮你找到对的工具。

[English](README.md) | [中文文档](README_CN.md)

---

</div>

## 一句话介绍

LazyBrain 是一个**自动帮你找到对工具的小助手**。你在 Claude Code 里输入任何话，它就能立刻知道你需要哪个 Skill，然后自动帮你加载——你完全不需要记住任何命令。

## 你是不是遇到过这些问题？

- "我知道有个工具能做代码审查，但叫什么来着？"
- "装了一堆 Skill，每次都懒得翻"
- "中文搜不到英文工具名"
- "每次都要手动输入 `/xxx`，好烦"

LazyBrain 就是来解决这些问题的。

## Wiki 知识库在哪？

`lazybrain compile` 会自动生成一个知识库，存在你电脑的 `~/.lazybrain/wiki/` 文件夹里。它不在项目仓库里——是运行时生成的。

里面有 16 个分类文件，把你所有工具按用途整理好了：

```
~/.lazybrain/wiki/
├── index.md           # 总目录（"491 capabilities across 15 categories"）
├── development.md     # 开发类工具（107 个）
├── operations.md      # 运维类工具（65 个）
├── content.md         # 内容创作类（60 个）
├── code-quality.md    # 代码质量类（48 个）
├── testing.md         # 测试类（43 个）
├── design.md          # 设计类（33 个）
├── orchestration.md   # 编排协调类（27 个）
├── planning.md        # 规划类（23 个）
├── security.md        # 安全类（22 个）
├── research.md        # 研究类（20 个）
├── data.md            # 数据类（14 个）
└── ...                # 更多分类
```

每个文件里列出了工具名称、一句话描述、标签、以及跟其他工具的关系（依赖、相似、组合使用）。你可以直接用 `cat ~/.lazybrain/wiki/orchestration.md` 看某个分类。

### 单个工具 Wiki 文件

`lazybrain compile` 也会为每个工具生成独立的 Markdown 说明文件：

- **路径**：`~/.lazybrain/wiki/<tool-name>.md`
- **内容**：工具描述、标签、示例查询、使用场景
- **用途**：`lazybrain wiki <tool-name>` 命令读取这些文件展示详情
- **生成方式**：每次 `lazybrain compile` 自动更新

如果 wiki 目录不存在，运行 `lazybrain compile` 即可生成。

## 怎么用？（3 步，5 分钟）

### 第 1 步：安装

```bash
npm install -g lazybrain
```

### 第 2 步：扫描 + 编译

```bash
lazybrain scan        # 找到你电脑上所有工具
lazybrain compile     # 让 AI 给每个工具打标签、建关系
```

编译完成后，LazyBrain 就知道你有哪些工具、每个工具是干嘛的了。

### 第 3 步：安装到 Claude Code

```bash
lazybrain hook install
```

**就这样，完事了。**

从此以后，你在 Claude Code 里随便说话，LazyBrain 就会自动帮你匹配工具：

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

## 它是怎么做到的？

LazyBrain 有三个阶段，全自动运行：

```
你装的工具 ──scan──▶ 知识图谱 ──compile──▶ 你说话 ──hook──▶ 自动推荐
(几十个Skill)     (AI理解每个    (每个工具有了      (匹配你的
                  工具是干嘛的)    标签和关系)       意图)
```

**扫描 (scan)**：找到你电脑上所有的 Skill、Agent、命令
**编译 (compile)**：AI 阅读每个工具的说明，生成标签和关系，建成一张"知识图谱"
**挂钩 (hook)**：装进 Claude Code，每次你输入时自动匹配

## 匹配引擎：五层过滤

你输入一句话后，LazyBrain 会按顺序通过五层来找到最合适的工具：

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
│  第 2 层：自动别名（学出来的）             │
│  你每次说"审查"都选 /review-pr？          │
│  那以后"审查"就自动跳过去                  │
│  ⚡ 0ms，越用越快                        │
└──────────────┬───────────────────────────┘
               │ 没有
               ▼
┌──────────────────────────────────────────┐
│  第 3 层：标签匹配                        │
│  "审查" → 扩展为 ["review", "audit"]      │
│  然后找带这些标签的工具                    │
│  ⚡ <1ms，不需要网络                     │
└──────────────┬───────────────────────────┘
               │ 拿不准
               ▼
┌──────────────────────────────────────────┐
│  第 4 层：语义向量                        │
│  用 AI 把你的话变成向量，算相似度          │
│  "审查代码" 和 "code-review" 语义很近     │
│  ⚡ ~100ms，需要联网                     │
└──────────────┬───────────────────────────┘
               │ 还是拿不准
               ▼
┌──────────────────────────────────────────┐
│  第 5 层：AI 秘书                        │
│  让 AI 再想一遍："用户到底想要什么？"      │
│  只在前四层都不确定时才启动                │
│  ⚡ ~2s，需要联网                        │
└──────────────────────────────────────────┘
```

**简单理解**：先看有没有快捷方式 → 再看关键词 → 再看语义 → 实在不行让 AI 帮忙想

**离线也能用**：前 3 层不需要网络，断网时也有 74.5% 的准确率。联网后准确率接近 100%。

## 越用越聪明：四种进化能力

LazyBrain 不只是帮你找工具，它会从你的使用习惯中学习：

**1. 拒绝学习** — 你拒绝的推荐，下次自动降权

```
你说 "审查代码" → LazyBrain 推荐 /wiki → 你没选
下次再说 "审查代码" → /wiki 排名自动下降
```

**2. 自动别名** — 重复的选择变成快捷方式

```
你说 "审查代码" → 选了 /code-review → 连续 3 次
下次 "审查代码" → 直接跳到 /code-review，零延迟
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

编译还会为每个工具生成一张百科卡片，包含：
- 工具的功能描述
- 适合什么场景
- 和哪些工具可以搭配使用
- 和哪些工具相似、区别在哪

```bash
lazybrain wiki review-pr     # 查看 /review-pr 的百科
```

百科按分类整理，放在 `~/.lazybrain/wiki/` 目录下：

```
~/.lazybrain/wiki/
├── index.md           # 总目录
├── code-quality.md    # 代码质量类
├── development.md     # 开发类
├── deployment.md      # 部署类
├── security.md        # 安全类
├── design.md          # 设计类
├── ...                # 等等
```

## 完整命令列表

| 命令 | 说明 |
|------|------|
| `lazybrain scan` | 扫描本地所有工具 |
| `lazybrain compile` | 编译知识图谱（需要 API key） |
| `lazybrain compile --offline` | 离线编译（不需要 API key） |
| `lazybrain match "你的话"` | 测试匹配效果 |
| `lazybrain list` | 列出所有工具 |
| `lazybrain wiki <工具名>` | 查看工具百科 |
| `lazybrain stats` | 图谱统计 |
| `lazybrain suggest-aliases` | 查看建议的快捷方式 |
| `lazybrain evolve` | 从使用中学习新标签 |
| `lazybrain evolve --dry-run` | 预览学习结果（不实际修改） |
| `lazybrain evolve --rollback` | 撤销上次学习 |
| `lazybrain hook install` | 安装到 Claude Code |
| `lazybrain hook uninstall` | 卸载 |
| `lazybrain config list` | 查看配置 |
| `lazybrain config set <键> <值>` | 修改配置 |

## 配置

第一次使用需要配置 API key（用于编译和语义匹配）：

```bash
# 必需：编译用 LLM
lazybrain config set compileApiBase https://api.siliconflow.cn/v1
lazybrain config set compileApiKey  <你的key>
lazybrain config set compileModel   Qwen/Qwen3-235B-A22B-Instruct-2507

# 推荐：语义搜索
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

## 数据都在哪？

```
~/.lazybrain/
├── config.json           # 你的配置
├── graph.json            # 知识图谱（366 个工具，11666 条关系）
├── graph.embeddings.bin  # 语义向量缓存
├── history.jsonl         # 使用记录（进化功能的数据源）
├── profile.json          # 你的使用画像
├── last-match.json       # 最近一次匹配结果
└── wiki/                 # 工具百科（按分类整理）
```

## 性能基准

| 模式 | Top-1 | Top-3 |
|------|-------|-------|
| 完整流水线（联网） | 100% | 100% |
| 仅标签（断网） | — | 74.5% |

测试集：55 条查询（33 条中文，22 条英文），366 个工具。

## 许可证

MIT
