# Changelog

All notable changes will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] - 2024-04-17

### Added

- **Semantic Skill Router** - Core matching engine with tag + alias + semantic layers
- **CLI Commands**:
  - `lazybrain scan` - Index skills, agents, and commands
  - `lazybrain compile` - Build knowledge graph with LLM-generated tags
  - `lazybrain match` - Test matching for any query
  - `lazybrain list` - Browse all indexed capabilities
  - `lazybrain stats` - View graph statistics and usage
  - `lazybrain hook install/uninstall` - Claude Code hook management
- **CJK Bridge** - Chinese-English cross-language matching
- **Embedding Support** - Semantic similarity matching for ambiguous queries
- **Secretary Layer** - LLM-powered routing for complex tasks
- **Token Tracking** - Usage analytics with savings estimates
- **Hook Proposals** - A/B/C options with token cost estimates
- **Strategy Modes** - `always-main`, `optimal`, `ask` for user control
- **198 Tests** - Comprehensive matching quality benchmarks

### Features

- 390+ capabilities indexed from Claude Code skills, agents, and commands
- 15 capability categories
- Golden-set validation with 60%+ top-1 accuracy
- Word-boundary matching to prevent false positives
- Circuit breaker for API resilience
- History-aware scoring with time decay
