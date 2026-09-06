# Use cases

## Local capability lookup

Use `lazybrain_recommend` or `lb find` when the available local capability is unclear.

| Situation | Appropriate action |
| --- | --- |
| Several video-analysis Skills are installed | Search specific terms such as `evidence video breakdown`; read the returned source before use. |
| A project has multiple deck or portfolio tools | Use `lb catalog` with `cwd`, `kind`, and pagination to compare local entries. |
| A plugin cache and a configured MCP server have similar names | Audit their paths and discovery states; neither proves callability. |
| A known image/video/presentation tool is already selected | Use the native Skill or tool directly; do not route through LazyBrain. |
| A request asks to generate media or publish a site | Use the selected execution tool and verify its real output separately. |

## Creative and evidence work

LazyBrain can locate a local Seedance, storyboard, video-evidence, image, presentation, or web capability. The returned metadata does not create a prompt, analyze the supplied video, generate a frame, make a deck, or put a portfolio online. Each result must be read and then used through the host under the current task's authorization.

## Automation and operations

Use the catalog to find an installed automation or operational capability when its name or source is unknown. Existing native automations should be inspected or invoked through their own host surface. LazyBrain does not schedule, trigger, or modify them.

## Auditing overlap

`lazybrain_catalog` supports `platform`, `cwd`, `kind`, `limit`, `offset`, and `refresh`. Compare origin, path, discovery state, compatibility, and status before deciding which source to read. Use `refresh: true` after a local metadata change; the default in-memory snapshot lasts at most 15 seconds.
