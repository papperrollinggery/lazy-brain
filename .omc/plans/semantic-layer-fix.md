# LazyBrain Semantic Layer — 修复提示词

## 背景

`@xenova/transformers` 因 sharp/libvips 网络问题无法安装。
已改用 `@huggingface/transformers`（官方继任者，API 完全兼容，纯 JS，无 native 依赖）。

`npm install @huggingface/transformers` 已成功，`package.json` 已有该依赖。

---

## 需要修复的文件

### 1. `src/indexer/embeddings/provider.ts`

只需修改第 8 行的 import：

找到：
```ts
import { pipeline, env } from '@xenova/transformers';
```

替换为：
```ts
import { pipeline, env } from '@huggingface/transformers';
```

注释第 1 行也顺便更新一下（可选）：
```ts
 * Local embedding generation using @huggingface/transformers.
```

其余代码不变。

---

## 验证

```bash
cd /Users/jinjungao/work/lazy_user

# 构建（应无 TS 错误）
npm run build

# 启用 hybrid 引擎
lazybrain config set engine hybrid

# 编译 + 生成 embedding（首次下载模型约 23MB）
lazybrain compile --offline

# 测试匹配
lazybrain match "帮我做代码审查"
lazybrain match "something vague about testing"

# 验证 tag-only 模式不加载 ONNX
lazybrain config set engine tag
lazybrain match "code review"
```

---

## 注意

- `@huggingface/transformers` 与 `@xenova/transformers` API 完全相同，`pipeline`、`env` 用法不变
- 模型名 `Xenova/all-MiniLM-L6-v2` 保持不变，HF 仓库里有这个模型
- 如果 `progress_callback` 的 `progress` 参数报 `any` 类型错误，加类型注解：`(progress: { status: string; file?: string }) => void`
