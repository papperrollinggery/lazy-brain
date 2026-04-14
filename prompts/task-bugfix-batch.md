# LazyBrain Bug Fix Batch — 15 Bugs

## 指令

修复以下 15 个 bug。每个 bug 修完后 `npm run build` 确认编译通过再继续下一个。
全部修完后跑一次 `lazybrain scan && lazybrain compile --offline && lazybrain match "代码审查"` 验证。

---

## Critical（必须修）

### Bug #1: dedup 跨平台 key 碰撞
**文件:** `src/scanner/dedup.ts:36`
**问题:** key 是 `${cap.origin}:${cap.name}`，ECC 下不同平台（cursor/kiro/openclaw）的同名 skill 都是 origin="ECC"，会被错误去重。
**修法:** 改 key 为 `${cap.origin}:${cap.compatibility.sort().join(',')}:${cap.name}`，让不同平台的同名 skill 保留。

### Bug #2: compiler Phase 1 result.value 未检查 status
**文件:** `src/compiler/compiler.ts` Phase 1 的 `Promise.allSettled` 结果处理
**问题:** rejected 后 continue，但后面直接解构 `result.value`，没有 `result.status === 'fulfilled'` 检查。
**修法:** 在解构前加 `if (result.status !== 'fulfilled') continue;`

### Bug #3: compiler Phase 2 type guard 写反
**文件:** `src/compiler/compiler.ts` Phase 2 关系推断结果处理（约 271 行）
**问题:** `if (!result.value || Array.isArray(result.value)) continue;` 逻辑错误。rejected 时 value 是 undefined，fulfilled 时 value 可能是空数组 `[]`（合法返回）。
**修法:** 改为：
```ts
if (result.status !== 'fulfilled') continue;
const val = result.value;
if (!val || Array.isArray(val)) continue;
```

### Bug #4: config 嵌套 key 崩溃
**文件:** `src/config/config.ts:43-46`
**问题:** 如果 parent key 已经是 primitive（如 `compileModel: "claude-sonnet"`），设置 `compileModel.foo` 会崩。
**修法:** 加类型检查，如果 parent 是 primitive 就覆盖为 `{}`。

---

## High（影响结果）

### Bug #6: history boost 用 name 匹配不稳定
**文件:** `src/matcher/matcher.ts` `applyHistoryBoost` 函数
**问题:** `freq[entry.matched]` 和 `freq[r.capability.name]` 用 name 匹配，name 可能重复（不同 origin 同名）。
**修法:** 如果 HistoryEntry 有 ID 字段就用 ID，没有就保持现状（这个改动需要同时改 HistoryEntry 类型，如果改动太大就跳过）。

### Bug #9: tokenize 漏掉短词
**文件:** `src/matcher/tag-layer.ts:30`
**问题:** regex `/[a-z][a-z0-9-]{1,}/g` 要求至少 2 字符，"ai"、"v2" 等短词被丢弃。
**修法:** 改为 `/[a-z][a-z0-9-]*/g`（允许 1 字符），或者 `/[a-z][a-z0-9-]{0,}/g`。

---

## Medium（边界情况）

### Bug #5: tokenize 不匹配数字开头的词
**文件:** `src/matcher/tag-layer.ts:30`
**问题:** regex 要求以字母开头，"3d"、"2fa" 等不会被匹配。
**修法:** 改为 `/[a-z0-9][a-z0-9-]*/g`。注意和 Bug #9 一起改。

### Bug #7: cmdMatch 没传 platform
**文件:** `bin/lazybrain.ts` `cmdMatch` 函数
**问题:** 检查 `cmdMatch` 是否把 `config.platform` 传给了 matcher。如果已经通过 `config` 传了就不用改。

### Bug #8: 关系推断 target 找不到时静默丢弃
**文件:** `src/compiler/compiler.ts` Phase 2 `graph.findByName(rel.target)`
**问题:** 如果 LLM 返回的 target name 不存在，静默跳过。
**修法:** 加 debug 日志（`process.stderr.write`），不需要报错。

### Bug #10: embedding batch 顺序未验证
**文件:** `src/indexer/embeddings/provider.ts`
**问题:** API 返回的 embedding 按 index 排序，但没验证返回数量是否等于输入数量。
**修法:** 加 `if (data.data.length !== texts.length) throw new Error(...)` 检查。

### Bug #11: 关系推断 JSON 解析后未验证数组元素结构
**文件:** `src/compiler/compiler.ts` Phase 2
**问题:** `parseJsonResponse` 返回后直接遍历，没验证每个元素有 target/type/confidence 字段。
**修法:** 加 filter：`relations.filter(r => r.target && r.type && typeof r.confidence === 'number')`

### Bug #12: graph.ts 嵌套对象验证
**文件:** `src/graph/graph.ts`
**问题:** 检查 `addNode` 和 `addLink` 是否有基本的参数验证。如果没有，加 `if (!node.id) throw` 级别的检查。

### Bug #13: trigger merge 顺序不确定
**文件:** `src/scanner/dedup.ts:48`
**问题:** `group[0]` 作为 canonical，但哪个是 first 取决于扫描顺序。
**修法:** 优先选 compatibility 包含更多平台的那个作为 canonical。

### Bug #14: matcher 空 graph 无反馈
**文件:** `src/matcher/matcher.ts:42`
**问题:** `allNodes` 为空时返回空结果，用户不知道 graph 是空的。
**修法:** 在 `match()` 开头加检查，如果 `allNodes.length === 0`，在 matches 里返回一个提示或者抛错。

### Bug #15: tag-layer 分数计算
**文件:** `src/matcher/tag-layer.ts:155`
**问题:** 分数可能超过 1.0 再被 clamp，逻辑脆弱。
**修法:** 这个已经有 `Math.min(1, ...)` 保护，不需要改。跳过。

---

## 验证

```bash
npm run build
lazybrain scan
lazybrain compile --offline
lazybrain match "代码审查"
lazybrain match "ai"
lazybrain match "v2"
```
