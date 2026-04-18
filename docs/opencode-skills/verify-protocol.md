# verify-protocol.md — Opencode Agent Commit 前验证流程

## 触发时机

每次 commit 前必跑，不管任务大小。

## 验证步骤

### 1. Build 验证

```bash
npm run build 2>&1 | tail -10
```

**通过标准：** exit code = 0，输出无 error。

### 2. Test 验证

```bash
npm test 2>&1 | tail -10
```

**通过标准：** exit code = 0，所有测试 passed。

### 3. 贴输出到 Comment

验证通过后，在 issue comment 贴完整输出片段：

```
## 验证结果

**Build (前 3 行 + 最后 10 行)：**
```
$ npm run build 2>&1 | head -3
$ npm run build 2>&1 | tail -10
```

**Test (前 3 行 + 最后 10 行)：**
```
$ npm test 2>&1 | head -3
$ npm test 2>&1 | tail -10
```

✅ Build passed，✅ Test passed
```

### 4. Commit 规则

```
git add <具体文件>
git commit -m "<type>: <简短描述>"
```

- **type** 只能是：`feat` / `fix` / `docs` / `style` / `refactor` / `test` / `chore`
- commit message 英文或中文均可，简短
- commit author 必须是 agent 自己（已配置 git config）
- **禁止** `--no-verify`

### 5. Push 规则

```
git push origin <branch>
```

**Push 是完成的一部分。** 未 push 视为任务未完成（参考 LAZ-65 §2.3）。

## 失败处理

Build 或 Test 失败：
1. 修复问题（不要猜，找根因）
2. 重新验证
3. 贴失败输出到 comment，说明原因
4. 修复后再 push

## 文件位置

本文件：`docs/opencode-skills/verify-protocol.md`
关联：docs/opencode-skills/todo-protocol.md、docs/opencode-skills/ask-claude-protocol.md
