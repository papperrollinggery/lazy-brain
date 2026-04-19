# todo-protocol.md — Opencode Agent 自管进度协议

## 何时用

**≥2 步任务必用。** 单步任务不需要。

- 任务有 2 个或以上子步骤
- 完成一项后需要记录进度
- 需要让 reviewer 看到实时状态

## 核心格式

在 issue comment 里用 Markdown task list：

```markdown
## TODO
- [ ] 第一步：做某事
- [ ] 第二步：做某事
- [x] 第三步：已完成（如果有的话）
```

## 操作规则

### 每完成一项，立即更新 comment

**不要等全部完成才发 comment。**

正确做法：
1. 领任务 → 发初始 TODO
2. 完成第一步 → `edit` comment → 标记 `[x]`，添加进度说明
3. 完成第二步 → `edit` comment → 标记 `[x]`，添加进度说明
4. 全部完成 → 标记所有 `[x]`，发最终结果

### Edit 而非 Replace

用 Edit 工具**局部修改** comment，不要整个 replace。

正确：
```
旧: - [ ] 第一步
新: - [x] 第一步 ✅（已完成 xxx）
```

错误：删掉整个 comment 重写。

## 模板范例

```markdown
## TODO
- [ ] 步骤 1：了解当前代码结构
- [ ] 步骤 2：修改 xxx 文件
- [ ] 步骤 3：验证 build 通过
- [ ] 步骤 4：提交并 push

**进度：**
- [x] 步骤 1：已读完 src/xxx.go 的主要逻辑
- [ ] 步骤 2：进行中
```

## 与 verify-protocol 配合

完成所有 TODO 后，跑 verify-protocol 流程：
1. `npm run build 2>&1 | tail -10`
2. `npm test 2>&1 | tail -10`
3. 通过后贴输出，commit，push

## 文件位置

本文件：`docs/opencode-skills/todo-protocol.md`
关联：docs/opencode-skills/verify-protocol.md
