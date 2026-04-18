# ask-claude-protocol.md — Opencode Agent 升级协议

## 何时升级

遇到以下情况，停止自己摸索，立即升级：

| 场景 | 说明 |
|------|------|
| **架构决策** | 需要在多个方案中做选择，影响系统设计 |
| **prompts/ 改动** | prompts/ 目录是路线蓝图，非 owner 不可改 |
| **多模块重构** | 涉及 2+ 个核心模块（src/matcher/、src/graph/ 等） |
| **需要 web_search** | Opencode agent 没有网络搜索能力 |
| **安全/权限问题** | 涉及敏感操作、secret、credentials |
| **调试 2h+ 无进展** | 已尝试多种方法仍失败 |

## 升级格式

在 issue comment 发：

```markdown
[ESCALATE-CLAUDE] <1 句话说明事由> — <已尝试的办法>

**已尝试：**
1. 办法 A（结果：xxx）
2. 办法 B（结果：yyy）

**阻塞点：**
- <具体卡住的地方>

**期望帮助：**
- <具体需要什么>
```

## 升级后动作

1. **立即停手** — 不继续尝试，不猜答案
2. **改 issue 状态** 为 `blocked`
3. **等 CEO/CTO** 接手或指派
4. **不 commit** — 未解决的问题不 push

## 示例

### 好的升级

```
[ESCALATE-CLAUDE] v2 API 兼容方案未确定 — 已尝试版本检测和 feature flag 两种方案

**已尝试：**
1. 在请求头加 `Accept-Version: 2.x`（结果：后端不支持）
2. 加 feature flag `enable_v2_api`（结果：配置分散，难以管理）

**阻塞点：**
- 需要统一决定：是版本共存还是渐进迁移

**期望帮助：**
- 确定 API 策略方向
```

### 不好的升级

```
[ESCALATE-CLAUDE] 不会做 ❌（没写已尝试什么，没写具体阻塞点）
```

## 升级 vs 自己解决

| 自己解决 | 升级 |
|----------|------|
| 1h 内能搞定 | 超过 1h 无进展 |
| 知道方向，只是耗时 | 完全不知道方向 |
| 改错会回退 | 影响架构/核心逻辑 |
| 单一文件修改 | 多模块改动 |

## 文件位置

本文件：`docs/opencode-skills/ask-claude-protocol.md`
关联：docs/opencode-skills/todo-protocol.md、docs/opencode-skills/verify-protocol.md
