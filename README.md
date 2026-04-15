# LazyBrain

> AI 编程助手的技能路由器 — 根据你的意图，自动推荐并注入最合适的 skill 或 agent。

你有几十上百个 skill，但每次都要手动想"该用哪个"。LazyBrain 解决这个问题：它在你输入 prompt 的瞬间，自动匹配最相关的工具，并把它注入到上下文里。

```
你: "帮我审查这个 PR"
LazyBrain: → /review-pr (92%) | /critic (78%) | /santa-loop (71%)
           已自动注入 /review-pr 到系统提示
```

## 工作原理

```
scan → compile → hook
 ↓        ↓        ↓
发现     LLM      每次
所有     打标     prompt
工具     签       自动匹配
```

1. **scan** — 扫描 `~/.claude/skills/`、MCP servers、内置命令，建立原始能力库
2. **compile** — LLM 为每个工具生成语义标签、示例查询、分类、关系图
3. **hook** — 安装 `UserPromptSubmit` hook，每次输入时自动匹配并注入推荐

匹配引擎支持三种模式：
- `tag` — 基于关键词和 CJK bigram，零延迟
- `embedding` — 基于向量语义相似度（需要 embedding API）
- `hybrid` — RRF 融合两层结果，兼顾精度和召回

## 安装

```bash
npm install -g lazybrain
```

**首次配置：**

```bash
lazybrain scan              # 扫描本地工具
lazybrain compile           # LLM 编译知识图谱（需要 API key）
lazybrain hook install      # 安装 Claude Code hook
```

## 配置

```bash
# 必须：编译用 LLM（支持 OpenAI 兼容接口）
lazybrain config set compileApiBase https://api.minimaxi.com/v1
lazybrain config set compileApiKey  <your-key>
lazybrain config set compileModel   MiniMax-M2.7

# 可选：语义搜索（推荐 SiliconFlow BAAI/bge-m3，免费）
lazybrain config set embeddingApiKey  <your-key>
lazybrain config set embeddingApiBase https://api.siliconflow.cn/v1
lazybrain config set embeddingModel   BAAI/bge-m3
lazybrain config set engine           hybrid   # tag | embedding | hybrid

# 推荐模式
lazybrain config set mode auto    # 自动注入（静默）
# lazybrain config set mode ask   # 弹出选择框
```

配置文件：`~/.lazybrain/config.json`

## 命令

```bash
# 匹配
lazybrain match "重构这段代码"     # 查找匹配的工具
lazybrain find  "代码审查"         # match 的别名

# 管理
lazybrain scan                     # 重新扫描工具
lazybrain compile                  # 重新编译知识图谱
lazybrain compile --force          # 强制全量重编译
lazybrain list                     # 列出所有工具
lazybrain stats                    # 图谱统计

# Hook
lazybrain hook install             # 安装 Claude Code hook
lazybrain hook uninstall           # 卸载 hook
lazybrain hook status              # 查看 hook 状态

# 配置
lazybrain config list              # 查看当前配置
lazybrain config set <key> <val>   # 设置配置项
```

## 特性

- **历史加权** — 常用工具自动排名更高，越用越准
- **Secretary 层** — 匹配置信度低时，LLM 二次判断意图
- **Wiki 卡片** — 每个工具有详细说明页，`lazybrain wiki`
- **增量编译** — 只重新编译有变化的工具，断点续传
- **CJK 支持** — 中文 bigram + bridge 映射，中英文混合查询

## 数据目录

```
~/.lazybrain/
├── config.json          # 配置
├── graph.json           # 知识图谱（含 embedding 向量）
├── history.jsonl        # 使用历史
├── profile.json         # 用户画像（secretary 层使用）
└── wiki/                # 工具 wiki 文章
```

## License

MIT
