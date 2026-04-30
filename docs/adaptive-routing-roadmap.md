# LazyBrain 自适应路由路线图

状态：规划已补齐
负责人：Codex 单线执行，重大产品取舍再升级议会
日期：2026-04-30

## 当前结论

项目已有规划，但范围不完整。

已存在规划覆盖：

- beta release 验收和 `ready --release`
- 路由编译、关系图质量门
- Claude hook 组合输出
- MCP 工具 envelope
- bilingual routing 基线

缺口：

- 没有完整定义“客户可选择模型、模式、技能、插件”的产品路径
- 没有统一的技能/插件冲突治理模型
- 没有把候选能力从“单一推荐”升级成“可解释 ChoiceSet”
- 没有把用户偏好、成本、延迟、风险纳入自适应决策
- 没有规定每阶段 handoff 的固定保存点

本路线图补齐这些缺口。

## 目标状态

LazyBrain 从“能力路由器”升级为“自适应执行选择层”。

最终行为：

- 识别用户意图、风险、上下文、预算、语言和平台
- 主动给出更合理的选择，而不是只返回一个技能
- 支持模型选择：快速、均衡、深度、本地、低成本、兜底
- 支持模式选择：直接执行、规划、评审、QA、自动驾驶、团队协作、发布
- 支持技能/插件选择：给出推荐、备选、禁用原因和冲突原因
- 重大决策才询问用户；普通路径自动执行最合理选项
- 不让多个技能、插件、hook 在同一事件上互相覆盖、重复执行或抢控制权

## 产品原则

- hook 路径保持轻量，负责提示和路由，不做重计算
- CLI、MCP、HTTP API 承担完整选择、诊断、验证和修复
- 推荐必须可解释：为什么选、为什么不选、风险是什么
- 客户始终能看到备选项，但默认执行最高置信度路径
- 不做不可验证的“自动切模型”；客户端不支持时只输出建议和命令
- 不在 hook 中跑 embedding、远程模型或长任务
- 不自动覆盖第三方插件配置

## 核心数据结构

新增 `ChoiceSet`，挂到现有 `RouteSpec`、CLI 输出、MCP envelope、HTTP API。

建议结构：

```ts
type ChoiceSet = {
  intent: string;
  recommended: ChoiceOption;
  alternatives: ChoiceOption[];
  conflicts: ConflictNotice[];
  policy: DecisionPolicy;
};

type ChoiceOption = {
  id: string;
  kind: "mode" | "model" | "skill" | "plugin" | "workflow";
  label: string;
  confidence: number;
  cost: "low" | "medium" | "high";
  latency: "fast" | "normal" | "slow";
  risk: "low" | "medium" | "high";
  reason: string;
  command?: string;
};

type ConflictNotice = {
  group: string;
  winner: string;
  suppressed: string[];
  reason: string;
  severity: "info" | "warn" | "block";
};
```

## 冲突治理模型

冲突按组处理，不按文件名临时判断。

冲突组：

- `hook:user-prompt-submit`
- `hook:session-start`
- `hook:stop`
- `hud:statusline`
- `router:intent-classifier`
- `model:execution-strategy`
- `mode:planner`
- `mode:autopilot`
- `skill:same-intent`
- `plugin:same-provider`
- `state:workspace-config`

处理规则：

- 同一 hook event 只能有一个 LazyBrain owner，其他 provider 进入 compose 层
- 同一 intent 的多个 skill 只推荐 top choice，其他作为 alternatives
- 插件提供相同能力时按平台、置信度、用户偏好、最近成功率排序
- 无法证明兼容时不自动串联执行
- 第三方插件配置只诊断，不静默覆盖
- Claude hook 不能承诺真实切换模型，只能建议模型策略

## 决策流程

1. 扫描 capability inventory：skills、plugins、agents、commands、hooks、models、modes
2. 归一化用户请求：语言、平台、任务类型、风险、成本、延迟、是否重大决策
3. 生成候选：能力图、标签匹配、bilingual bridge、历史成功率
4. 应用冲突解析：冲突组、provider 优先级、平台约束、hook 约束
5. 排序：置信度、客户偏好、成本、延迟、风险、验证能力
6. 输出 ChoiceSet：推荐项、备选项、冲突解释、执行命令
7. 执行后记录：成功、失败、用户覆盖选择、后续修正

## 路线图

### P0 基线冻结

目标：确认已有路线不被新规划冲掉。

交付：

- 保留当前 route benchmark 100% 基线
- 保留 MCP envelope：`status`、`summary`、`next_actions`、`artifacts`、`data`
- 保留 relation compile quality gate
- 保留 Claude hook 轻量原则

验收：

- `npm run build`
- `npm test`
- `npm run lint`
- `npm run audit`
- `npm pack --dry-run`

handoff：

- 更新 `docs/CODEX_HANDOFF.md`
- 更新 `.claude/EXECUTION-HANDOFF.md`
- 本文件 P0 标记完成

### P1 ChoiceSet schema

状态：已完成，2026-04-30

目标：把“单一推荐”升级为“推荐 + 备选 + 冲突说明”。

交付：

- 新增 `ChoiceSet`、`ChoiceOption`、`ConflictNotice`
- `RouteSpec` 挂载可选 `choices`
- CLI JSON 输出包含 `choices`
- HTTP API 输出包含 `choices`
- MCP route 工具 envelope 包含 `choices`
- 保持旧消费者兼容

验收：

- `lazybrain route "帮我修复测试" --json` 返回推荐模式和备选模式
- `lazybrain route "选择合适模型做架构评审" --json` 返回模型策略备选
- 旧字段不破坏现有测试

提交边界：

- `types: add choice set schema`
- `route: expose choices in cli and api`
- `mcp: include choices in route envelope`

handoff：

- 记录 schema 兼容策略
- 记录旧消费者影响
- 记录未接入 UI 的字段

结果：

- `RouteSpec` schema 升级到 `1.5.0`
- 新增 `choices.recommended`
- 新增 `choices.alternatives`
- 新增 `choices.conflicts`
- 新增 `choices.policy`
- CLI JSON、HTTP `/api/route`、MCP `lazybrain.route` 均返回 choices
- MCP harness envelope 顶层也返回 `choices`
- 旧字段保留，旧消费者仍可读原 RouteSpec 主体

验证：

- `npm run build`
- `npm run lint`
- `npm test -- test/orchestrator/route.test.ts test/server/server.test.ts test/mcp/server.test.ts`
- `node dist/bin/lazybrain.js route "选择合适模型做架构评审" --json`
- `node dist/bin/lazybrain.js route "what is TypeScript?" --json`

### P2 模型和模式推荐策略

目标：让 LazyBrain 能按任务性质推荐模式和模型策略。

模式策略：

- 简单事实或小改动：direct
- 需求不清但影响小：plan-lite
- 多文件代码改动：work
- 高风险代码、发布、迁移：plan + review + qa
- 长任务、客户目标明确：autopilot
- 架构取舍、成本取舍、不可逆操作：council escalation

模型策略：

- 快速执行：低成本模型
- 常规编码：均衡模型
- 架构、复杂调试、冲突裁决：强模型
- 本地隐私任务：本地模型优先
- 客户明确指定模型：尊重指定
- 客户未指定且风险高：强模型建议，但不强制切换

验收：

- 中文请求能返回中文解释
- 英文请求能返回英文解释
- 高风险请求不会直接走低成本模式
- hook 输出只提示，不承诺切换模型

提交边界：

- `policy: add mode recommendation rules`
- `policy: add model strategy ranking`
- `test: cover mode and model choices`

handoff：

- 记录推荐规则表
- 记录误判样例
- 记录需要用户确认的重大决策条件

### P3 技能和插件冲突解析

目标：避免技能、插件、hook 互相冲突。

交付：

- capability registry 增加 `provider`、`conflictGroup`、`platforms`、`sideEffects`
- hook installer 检测 owner 和 compose 层
- doctor 输出冲突诊断
- route 输出 suppressed alternatives
- 禁止同一事件重复注册多个 LazyBrain runner

验收：

- 两个插件声明同一 intent 时只推荐一个 winner
- 第三方 hook 存在时只诊断，不静默覆盖
- statusline 不重复输出低价值标签
- `lazybrain doctor --json` 能列出冲突组和修复建议

提交边界：

- `registry: model provider conflicts`
- `doctor: report plugin and hook conflicts`
- `hooks: enforce single owner with compose output`

handoff：

- 记录冲突组清单
- 记录所有 auto-fix 行为
- 记录禁止 auto-fix 的场景

### P4 自适应偏好和反馈

目标：从静态推荐升级为客户偏好自适应。

交付：

- workspace preference profile
- 最近成功/失败结果记录
- 用户覆盖选择记录
- 成本和延迟偏好
- 语言偏好
- 平台偏好

自适应规则：

- 用户连续覆盖某类选择后提升该模式权重
- 某 provider 连续失败后降权
- 高风险任务不因偏好跳过验证
- 偏好只影响排序，不绕过安全策略

验收：

- 同类任务第二次推荐能反映历史选择
- 失败 provider 被降权
- 用户可清空偏好
- 偏好文件可审计、可迁移

提交边界：

- `profile: persist workspace preferences`
- `learning: record choice outcomes`
- `ranking: apply adaptive weights`

handoff：

- 记录偏好 schema
- 记录隐私边界
- 记录清理和迁移命令

### P5 客户可见选择面

目标：让客户看到选择，而不是只看到内部路由。

交付：

- CLI compact choice card
- HTTP choice endpoint
- companion status surface
- MCP response structured choices
- 重大决策确认入口

UI 要求：

- 默认显示推荐项
- 备选项最多显示 3 个
- 冲突只显示可行动信息
- 不展示内部噪声
- 中文用户默认中文输出

验收：

- 客户能看到推荐模型、推荐模式、可替代模式
- 客户能看到“为什么没有选择某插件”
- 非重大决策不阻塞执行
- 重大决策能暂停并请求确认

提交边界：

- `cli: render choice card`
- `api: expose choice endpoint`
- `ui: show adaptive choices`

handoff：

- 记录 UI 截图或输出样例
- 记录客户验收路径
- 记录还未暴露的内部字段

### P6 评测和发布门禁

目标：用数据证明修改有效。

指标：

- route top-1
- route top-3
- 中文 top-1
- choice acceptance rate
- conflict false positive rate
- conflict false negative rate
- execution retry count
- average decision latency
- hook latency

验收门槛：

- 当前 benchmark 不回退
- hook 路径新增延迟低于 50ms
- high-risk task 不误走 direct
- 同一 hook event 不重复安装 runner
- `doctor --json` 对冲突有稳定输出

提交边界：

- `benchmark: add choice set cases`
- `test: add conflict regression suite`
- `release: enforce adaptive routing gates`

handoff：

- 记录最终 benchmark
- 记录失败样例
- 记录发布阻塞项

## 重大决策条件

以下情况才需要询问客户：

- 删除、覆盖、迁移第三方配置
- 自动执行付费或远程模型
- 改变默认 hook owner
- 删除已有技能、插件、agent
- 发布到 npm、创建 release、推送远端
- schema 不兼容变更
- 客户目标和当前代码事实冲突

其他情况按路线图直接执行。

## 执行顺序

1. P0 固定当前事实
2. P1 加 ChoiceSet schema
3. P2 加模型/模式推荐策略
4. P3 加冲突治理
5. P4 加自适应偏好
6. P5 暴露客户选择面
7. P6 加评测和发布门禁

## 当前首个执行任务

下一步应从 P2 开始。

最小有效切片：

- 增加模式推荐规则表
- 增加模型策略 ranking
- 覆盖高风险任务不会误走低成本 direct
- 写 handoff

P1 已完成，底层选择契约已稳定到 `RouteSpec` v1.5.0。
