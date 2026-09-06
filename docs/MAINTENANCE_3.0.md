# 3.0 maintenance and migration note

## Why the scope changed

LazyBrain previously accumulated route compilation, hooks, work envelopes, HTTP/UI surfaces, workflow composition, and preference machinery. The v2 rebuild removed roughly 33,000 lines of that old architecture. Its useful principles remain: give source evidence, avoid pretending a recommendation is execution, and keep authorization with the host and user.

3.0 does not revive the removed route/hook/server/workbench architecture. It narrows the product to a local metadata lookup and overlap audit that complements Codex.

## Migration

| Earlier surface | 3.0 behavior |
| --- | --- |
| Automatic hook guidance | Retired shim; continues without prompt reads, injection, or writes |
| `combo`, `orchestrate` | Return local candidates and leave workflow choice to the host |
| `rules` | Explain that automatic orchestration is retired |
| Default graph-driven route | Use `lazybrain_recommend` only for unresolved local lookup |
| Implicit usage statistics | Count only explicit non-empty `use` adoption reports |
| Built-in generic matching | Restrict it to `lb demo`; it is illustrative, not installed |
| Persisted graph on ordinary lookup | Use transient catalog data; run `lb compile` only for an explicit snapshot |

## Historical safety

Keep old branches and archives according to the repository's version-control policy until the final integration has been independently reviewed. Do not merge old implementation trees simply to recover concepts: reintroduce a behavior only when it is required by the current 3.0 contract and has focused verification. This note is not evidence that a branch merge, archive deletion, or release has completed.

## Current verification boundary

The historical v2.1 baseline recorded 157 passing tests, yet a Seedance screenplay lookup could still be misrouted to a Claude agent-development result through a generic trigger. That result is why 3.0 reserves built-in generic matching for `lb demo` and requires representative local lookup cases. Source and package checks establish code/package behavior only. Specific Codex integration, model availability, release CI, and real media or deployment results require fresh evidence in their actual environments.
