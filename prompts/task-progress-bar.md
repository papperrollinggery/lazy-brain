# Task: compile 进度条

## 背景

`lazybrain compile` 目前输出格式：
```
Compiling 491 capabilities...
  Mode: LLM (MiniMax-M2.7)
  [1/491] ai-slop-cleaner  [2/491] autopilot  [3/491] learner ...
```

所有进度都在同一行滚动，没有 ETA、速度、百分比，体验差。

## 目标

改成终端进度条，效果如下：

```
Compiling 491 capabilities...  Mode: LLM (MiniMax-M2.7)

Phase 1/2  Tags & Categories
  ████████████░░░░░░░░░░░░░░░░  43% [213/491]  ~8 min left  12.3 cap/min
  Current: swift-concurrency-6-2

Phase 2/2  Relation Inference
  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0% [0/491]
```

完成后：
```
✓ Compiled 491 capabilities  (0 errors, 0 skipped)
  Tokens: 1.2M input / 380K output
  Time: 38m 12s
```

## 关键文件

- `bin/lazybrain.ts` — compile 命令入口，调用 `compile()` 并传入 `onProgress` 回调
- `src/compiler/compiler.ts` — `CompileOptions.onProgress` 回调签名：`(current, total, name) => void`
- Phase 2 目前没有 progress 回调，需要补上

## 实现要求

1. **不引入外部依赖**，用 ANSI 转义码手写进度条（`\r` 覆盖当前行）
2. 进度条宽度 28 字符，`█` 填充，`░` 空白
3. ETA 用滑动窗口（最近 20 个样本）计算速度，避免开头速度抖动影响估算
4. Phase 2 在 `compiler.ts` 里补一个 `onRelationProgress?: (current: number, total: number) => void` 回调
5. 非 TTY 环境（CI、管道）降级为原来的 `[n/total] name` 格式

## 不需要做

- 颜色主题配置
- 动画 spinner
- 外部进度条库

## 验证

```bash
npm run build
lazybrain compile --force
```

看到两阶段进度条正常渲染，完成后打印汇总。
