# LazyBrain UI Redesign Plan

Status: draft
Date: 2026-05-06
Scope: replace the current single-page accordion dashboard with a guided multi-page local routing workbench.

## Current State

Current UI truth:

- `src/ui/html.ts` is still a single HTML string with stacked sections.
- Current first screen mixes readiness, router trial, recent routes, config, graph, diagnostics, setup, and advanced details in one page.
- Route adoption backend already exists: `/api/route`, `/api/route-events`, `/api/route-events/adopt`, `/api/route-events/regression`.
- Graph/search/status/diagnostics endpoints already exist and can be reused.

Generated reference images:

- Composite exploration, not for slicing: generated image reference
- Multi-page board, directional only: generated image reference
- Setup page reference: generated image reference
- Route Studio reference: generated image reference
- Adoption Review reference: generated image reference
- Capability Map reference: generated image reference
- Diagnostics reference: generated image reference

## Product Direction

LazyBrain should feel like a local AI routing workbench:

- guided enough for first-run setup
- fast enough for daily route use
- explicit enough to prove adoption
- inspectable enough to trust the graph
- repairable enough when hooks, model config, embeddings, or graph state drift

The UI should not feel like an ops dashboard. It should feel like a developer product with clear pages, progressive disclosure, and one obvious next action.

## Information Architecture

### App Shell

Persistent frame:

- left sidebar navigation
- top status bar
- global refresh action
- status dot with `READY`, `WARN`, or `ERROR`
- toast layer
- shared loading and empty states

Navigation:

- Setup
- Route Studio
- Adoption Review
- Capability Map
- Diagnostics

### Page 1: Setup

Job:

Help a user get LazyBrain into a usable state.

Primary content:

- setup progress: connect local capabilities, scan, compile, health check
- one primary action: scan and compile
- compact readiness blockers
- LLM and embedding config state
- privacy note: local-first, no raw prompt storage in route events

Required states:

- first run
- graph missing
- graph stale
- LLM missing
- embedding optional
- ready
- compile running
- compile failed

Backend reuse:

- `GET /api/status`
- `POST /api/compile?scan=1`
- `GET /api/compile/status`
- `POST /api/config`
- `GET /api/embedding/discover`
- `GET /api/test`

Backend gap:

- Add `GET /api/setup/status` later if the page starts duplicating status derivation logic.

### Page 2: Route Studio

Job:

The daily product surface. User describes work, LazyBrain recommends how to route it.

Primary content:

- task composer
- target selector: Claude, Codex, Cursor, Generic
- recommended workflow, skill, model, confidence
- why this route
- execution steps
- copy prompt actions
- alternatives ranked by score
- current route event ID/query hash

Required states:

- empty prompt
- routing
- no match
- match with warnings
- match with clarification questions
- copied prompt
- adoption write failed but clipboard succeeded

Backend reuse:

- `POST /api/route`
- `POST /api/route-events/adopt`
- `POST /api/choices/feedback`

Backend gap:

- Route response should expose a stable `explanation` block for UI rendering instead of forcing the frontend to infer from mixed fields.
- Route response should expose a normalized `alternatives` array across skills, models, and workflows.

### Page 3: Adoption Review

Job:

Make route quality visible and turn bad routes into regression cases.

Primary content:

- adoption rate
- copied prompts count
- accepted/rejected count
- converted tests count
- route event timeline/table
- reason selector: wrong skill, wrong model, too broad, missed council, bad copy prompt, other
- selected event inspector
- regression status: ready, pending_query, hash mismatch

Required states:

- empty events
- event copied
- event accepted
- event rejected
- event converted to test
- pending query
- hash mismatch
- write failure

Backend reuse:

- `GET /api/route-events?limit=20`
- `POST /api/route-events/adopt`
- `POST /api/route-events/regression`

Backend gap:

- Add pagination, filters, and aggregation to `/api/route-events`.
- Return summary stats in the same response or add `/api/route-events/stats`.

### Page 4: Capability Map

Job:

Show what LazyBrain knows, why it can recommend tools, and where the capability graph is weak.

Primary content:

- searchable capability list
- segmented filters: skills, agents, commands, all
- graph visualization
- selected node inspector
- duplicate/conflict indicators
- isolated node indicators
- source path and route coverage

Required states:

- graph missing
- graph loaded
- no search results
- selected node
- duplicate group
- isolated node
- graph render failed

Backend reuse:

- `GET /api/graph`
- `GET /api/search`
- `GET /api/duplicates`
- `GET /api/capability/:id`

Backend gap:

- Add a normalized `GET /api/capabilities` endpoint if `/api/search` and `/api/capability/:id` force too much UI-specific stitching.
- Include node quality fields: description quality, route coverage, missing metadata, duplicate group ID.

### Page 5: Diagnostics

Job:

Make maintenance clear without polluting daily use.

Primary content:

- readiness summary
- grouped health sections: hook runtime, LLM config, embedding cache, graph index, local server, privacy storage
- blocker/warning list
- repair actions
- compile/rebuild logs
- masked config snapshot

Required states:

- ready
- warnings only
- blockers
- repair running
- repair succeeded
- repair failed

Backend reuse:

- `GET /api/status`
- `GET /api/diagnostics`
- `GET /api/compile/status`
- `POST /api/compile`
- `GET /api/embeddings/status`
- `POST /api/embeddings/rebuild`
- `POST /api/test`

Backend gap:

- Add a unified repair action abstraction only after the UI proves repeated action patterns.

## Design System

Layout:

- fixed sidebar: 220px desktop
- topbar: 56px
- page max width: none for workbench pages
- page padding: 24px
- panel gap: 16px
- panel radius: 8px max

Colors:

- background: warm neutral, not pure white
- surface: white or near-white
- text: near-black
- secondary text: neutral gray
- accent blue for primary route/setup actions
- green for ready/adopted
- amber for warning/pending
- red for blockers/rejected
- purple only for agents, not dominant theme

Typography:

- system sans for UI
- monospace only for IDs, hashes, paths, logs, commands
- no viewport-scaled type
- no negative letter spacing
- dense but readable controls

Component rules:

- use icon buttons for refresh, copy, open, inspect
- use segmented controls for page-local filters
- use badges for status, not full-color panels
- avoid cards inside cards
- avoid marketing hero blocks
- avoid decorative blobs and one-note palettes

## Frontend State Model

Global state:

- `status`
- `diagnostics`
- `compileStatus`
- `routeEvents`
- `selectedRouteEventId`
- `selectedCapabilityId`
- `activePage`
- `toastQueue`

Page state:

- Setup: `setupStep`, `compileRunning`, `configEditing`
- Route Studio: `query`, `target`, `routeResult`, `routeLoading`, `copyState`
- Adoption Review: `filters`, `selectedEvent`, `feedbackDraft`
- Capability Map: `graph`, `capabilities`, `filters`, `graphError`
- Diagnostics: `repairAction`, `logsExpanded`

## Implementation Plan

Phase 1: Shell and navigation

- Replace accordion first screen with app shell.
- Keep all current API calls.
- Keep old sections as page content, split by route/page state.

Phase 2: Route Studio and Adoption Review

- Make Route Studio the default page after setup is ready.
- Move recent routes into Adoption Review.
- Add selected event inspector.
- Keep privacy-safe route event behavior unchanged.

Phase 3: Setup and Diagnostics

- Convert setup steps into guided first-run flow.
- Move config editing and health detail out of daily route page.
- Keep repair actions explicit and local-only.

Phase 4: Capability Map

- Rework graph and tool inventory into an inspectable page.
- Add selected node details.
- Preserve Cytoscape dependency for now.

Phase 5: Backend cleanup

- Add normalized endpoints only where frontend duplication appears.
- Preferred first additions:
  - `GET /api/route-events?limit=&cursor=&outcome=&target=`
  - `GET /api/route-events/stats`
  - `GET /api/capabilities`
  - optional `GET /api/setup/status`

## Acceptance Criteria

- First screen has one obvious next action.
- Daily route use does not require scrolling past config or diagnostics.
- A copied prompt visibly changes route adoption state.
- A rejected route can be labeled and converted to a regression fixture.
- Capability graph is inspectable by selected node.
- Diagnostics shows blocker, impact, technical detail, and repair action.
- Empty, loading, error, warning, ready, and partial states are visible.
- The UI can run from the existing local HTTP server with no external frontend build step.

## Non-Goals

- No image slicing from generated PNGs.
- No React migration in the first pass.
- No hosted telemetry.
- No raw prompt storage in route events.
- No hook install from the main daily-use page.
