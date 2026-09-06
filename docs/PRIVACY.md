# Privacy and local data

LazyBrain scans bounded local metadata to build a transient catalog. Matching does not call an LLM, embedding service, or network endpoint.

## What a catalog result can contain

- Capability name, kind, description, path, origin, compatibility, and discovery state.
- Metadata extracted from local Skill, plugin, MCP, agent, command, and marketplace files.
- Scan errors and a timestamp for the current in-memory snapshot.

MCP configuration and plugin caches may reveal that a source exists. They do not prove a server is enabled or callable. Secret values are not catalog evidence and must not be copied into results.

## What is persisted

- A query does not create history.
- `lb compile` explicitly writes a local graph snapshot under the LazyBrain data directory.
- `lb use` writes an explicit adoption report. It is not evidence of execution, verification, generated media, deployment, or permission.
- `lb stats` counts only non-empty explicit adoption reports and does not estimate time saved.

The 15-second catalog cache is process memory, not a remote service. Delete local data only through a deliberate, separately authorized filesystem operation.
