---
name: lazybrain-find
description: Find AI coding tools by description. Ask: "帮我找代码审查的工具"
triggers:
  - 帮我找 xxx 工具
  - 有什么工具可以 xxx
  - 找 xxx skill
  - 查找 xxx
  - find tool
kind: command
origin: lazybrain
compatibility:
  - claude-code
---

# LazyBrain Find

Search for AI coding tools by natural language description.

## Usage

```bash
lazybrain find "帮我找代码审查工具"
```

## Examples

- `帮我找做测试的工具` → returns matching capabilities
- `find tools for code review` → English query support
- `有什么工具可以重构代码` → returns refactoring tools

## How It Works

1. Tokenizes your query
2. Matches against capability tags, descriptions, and example queries
3. Ranks by relevance score
4. Shows top 5 matches with scores

## Output Format

```
Query: 帮我找代码审查工具

Results:
  [1] code-review (85%) [claude-code]
  [2] security-scan (62%) [claude-code]
  [3] lint-check (45%) [claude-code]

Tips:
  ↑ 历史加权 +X%  = Previously used tools get boosted
  Run without args to enter interactive mode
```
