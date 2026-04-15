# Trae 任务: LazyBrain v2.1 剩余改动 — ✅ 全部完成

> 所有任务已由 Trae 完成并通过 build 验证。

## ✅ 任务 A: Statusline 增强
- A1. `src/constants.ts` — STATUS_PATH 常量
- A2. `bin/hook.ts` — writeLastMatch 加 model 字段
- A3. `bin/statusline.ts` — 显示模型名 + 编译/扫描状态
- A4. `bin/lazybrain.ts` — scan/compile 写 status.json

## ✅ 任务 B: Disabled Status
- B1. `src/types.ts` — RawCapability 加 disabled 字段
- B2. `src/scanner/scanner.ts` — skills-disabled 目录检测
- B3. `src/compiler/compiler.ts` — disabled → status 传递（4 处）
- B4. `src/matcher/matcher.ts` — 过滤 disabled nodes

## ✅ 任务 C: 评分归一化
- C1. `src/matcher/tag-layer.ts` — 归一化因子 0.3 → 0.5
