# Product direction: 3.0

LazyBrain supplements Codex with source-aware local capability discovery. Its job is narrow: locate and compare local metadata when a user or host cannot identify the right installed capability.

## Product contract

1. Inventory bounded local metadata without uploading it.
2. Return small, explainable candidates with path, origin, discovery state, compatibility, and `callableVerified: false`.
3. Support source comparison and overlap review through catalog filtering and pagination.
4. Leave reasoning, model selection, workflow composition, authorization, and execution to the host.

The primary surface is Codex Desktop through `lazybrain_recommend` and `lazybrain_catalog`. CLI commands expose the same read-only lookup. The scanner traverses metadata roots only, follows bounded symlink targets, and treats configuration/cache entries as non-callability evidence.

## Decision boundary

Do not invoke LazyBrain for a normal task merely because it is broad or creative. When a known native tool or Skill fits, use it directly. Ask LazyBrain only when the local capability, source, or overlap is unresolved.

For example, a known Seedance prompt skill can be used to write a prompt; LazyBrain is useful when several local visual-prompt skills might fit. A selected video-evidence workflow can inspect a real clip; a catalog result cannot prove the clip was processed. A deck or portfolio can be edited once its tool is known; a metadata match cannot prove delivery or publication.

## Non-goals

- Executing, installing, enabling, or validating a capability.
- Replacing a host model's tool choice or hard-coding model versions.
- Default visualizations, confirmation gates, automatic workflows, or hooks that inject guidance.
- LLM, embedding, or network matching.
- Treating a recommendation, metadata path, or adoption report as runtime evidence.

## Evidence levels

The catalog may establish that a metadata source was found. It does not establish that its capability is available in the current task. `lb use` establishes only a user adoption report. Successful generation, execution, delivery, deployment, or host exposure requires separate evidence from the actual tool or host.
