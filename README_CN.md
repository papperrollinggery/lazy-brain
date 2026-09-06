# LazyBrain 3.0

LazyBrain 是给 Codex 用的本机 metadata 查找工具。它解决的是：忘了已安装的 Skill、Plugin、MCP、agent 或 command 在哪里，以及本机多个能力是否重叠。

它不替代宿主模型推理、原生工具选择、用户授权或实际执行。已经知道该用什么 Skill 或工具时，直接用原生能力。

## 什么时候用

具体任务直接执行：已经选定提示词 Skill 后写 Seedance；按已知工作流拆真实视频证据；编辑已确认的客户提案 PPT；改明确的网站模块；运行已知自动化。

只有“本机该找哪个能力”尚不明确时才查 LazyBrain：

```bash
lb find "哪个已安装技能适合做视频证据拆解？"
lb catalog "presentation" --kind skill --platform codex
lb catalog --cwd /absolute/project --kind mcp --limit 20 --offset 0
```

返回的是 metadata 证据。路径、插件缓存或配置条目不代表能力已启用、可调用或适合当前任务。选中后仍应读取 Skill，或核对当前宿主工具。

## 它读取什么

LazyBrain 在本机做有边界的 metadata 扫描：Codex home、当前项目到 Git 根目录的配置、支持的 manifest 与符号链接位置。它识别 Skills、plugins、MCP 声明、agents、commands 和 marketplace 条目。缓存和配置只能用于盘点，不能当作可调用证明。

匹配完全在本机进行，没有运行时 LLM、embedding 或网络匹配；它不会覆盖宿主模型名，也不硬编码某个模型版本。当前任务能选什么模型和原生工具，由宿主决定。

YAML 解析只作为构建依赖并打入 `dist`；包不声明运行时依赖。

## Codex Desktop

打包 MCP 只公开两个只读工具：

- `lazybrain_recommend`：本机能力尚未确定时，返回很短的候选列表。
- `lazybrain_catalog`：盘点、来源对照与重叠审计。

二者支持 `cwd`、`platform`、`kind`、`limit`、`refresh`；catalog 还支持 `offset`。默认快照只在内存保存最多 15 秒，`refresh: true` 可跳过缓存。条目会给出来源路径、origin、discovery 状态和 `callableVerified: false`。

LazyBrain 不默认打开可视化、不强制确认、不拼自动 workflow，也不自动执行。只有明确请求时才给可选比较 payload；是否渲染和是否行动仍由宿主与用户决定。

本地源码安装：

```bash
npm ci
npm run build
codex plugin marketplace add .
codex plugin add lazybrain@lazybrain-local --json
```

修改 plugin、Skill 或 MCP 契约后，重新开一个 Codex task，使宿主重新加载它们。见 [Codex Desktop 安装](docs/CODEX_DESKTOP.md)。

## CLI

```bash
lb find "本机能力查找"
lb catalog "video" --kind skill --json
lb scan                    # 只读 metadata，不写入
lb compile                 # 显式保存本机 metadata 快照
lb ready                   # 报告 metadata 可用性，不是工具就绪证明
lb use skill-name "任务"  # 记录采用报告，不执行也不验证
lb stats                   # 只看明确采用记录
lb demo "write a test"    # 内置示例，不是已安装能力
```

`quickstart`、`discover`、`scan` 是 catalog 别名。旧的 `combo`、`orchestrate` 返回本机候选；`rules` 显示退役说明，workflow 由宿主处理。旧 hook 是退役 shim：继续返回但不读提示词、不注入内容、不写状态。

查询不写入历史。上面的命令里只有 `compile` 会保存图快照。`use` 只是明确采用的报告，不证明能力运行过、成功过、生成过媒体或已经上线。`stats` 不把未采用的推荐算成使用，也不编造节省时间。

## 安装 release artifact

GitHub v3.0.0 release artifact 可用后，安装精确 tarball：

```bash
npm install -g https://github.com/papperrollinggery/lazy-brain/releases/download/v3.0.0/lazybrain-3.0.0.tgz
```

npm registry 是否已发布是另一件事，使用 npm tag 前必须单独核实。包内自带 `dist`；`.mcp.json` 用包目录下的 `node ./dist/bin/mcp.js` 启动，不依赖另一份全局 MCP 安装。

## 边界与验证

LazyBrain 适合发现与审计，不能证明运行时效果。metadata 结果不能当作视频已生成、PPT 已交付、网站已上线，或原生能力已暴露到当前 Codex task 的证据。

准备 release candidate 时运行下列命令，并记录实际输出：

```bash
npm ci
npm run lint
npm run build
npm test
npm run audit:public
node scripts/validate-codex-plugin.js
```

更多说明见 [PRODUCT](docs/PRODUCT.md)、[INSTALL](docs/INSTALL.md)、[PRIVACY](docs/PRIVACY.md) 与 [USE CASES](docs/USE_CASES.md)。

MCP 调用必须传入当前项目的绝对 cwd，防止把插件安装目录当作项目目录。
