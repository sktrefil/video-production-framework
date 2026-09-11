# WF-07 CLI Operations Completion Report

Status: **PASS**

## Execution identity

- Repository: `sktrefil/video-production-framework`
- Branch: `feature/wf07-cli-operations`
- Base HEAD: `7ed83f55c9fd468357ace7968db380555a2bb293`
- Implementation HEAD: `cf25b77457fb2ec6b0fd571de4aa16e43b65e5a6`
- Implementation CI: `34563322345`
- `pilot-readiness`: PASS
- `e2e`: PASS
- Node 22 install/build/typecheck/test: PASS
- Node 24 install/build/typecheck/test: PASS
- CLI suite: `14 / 14 PASS`
- Logical unit/integration regression after this work: `208 / 208 PASS`

The documentation tip containing this report is validated separately as the final branch-tip gate.

## Purpose

MIG-13 made the framework ready for real pilots, but the public CLI still exposed only bootstrap/readiness commands. WF-07 Story services already existed internally, so this work closes the operator entrypoint gap without replacing or bypassing the accepted domain/storage architecture.

This is a post-MIG-13 operational gap closure, not a new migration stage and not MIG-14.

## Existing authorities reused

No second Story system was introduced.

The CLI delegates to the accepted implementations:

```text
ProjectBootstrapService
  -> resolves projectRoot/projectDbPath/format

StoryPipeline
  -> research/fact/script/revision/final approval

StoryGenerationService
  -> validated Chapter/Sequence/Scene materialization + approvals

SqliteStoryRepository
  -> canonical project.db persistence
```

`project.db` remains the canonical project authority.

## Commands delivered

```text
vpf research add <project_id> ...
vpf fact add <project_id> ...
vpf fact approve <project_id> <fact_id>

vpf script create <project_id> --file <project-file> [--kind DRAFT|FINAL]
vpf script revise <project_id> <script_id> --file <project-file> [--kind DRAFT|FINAL]
vpf script approve <project_id> <script_id> [--approved-by <id>]

vpf story generate <project_id> --plan <project-file>
vpf story status <project_id>
vpf story approve-structure <project_id> [--approved-by <id>]
vpf story approve-scenes <project_id> (--all | --scene <scene_id>...) [--approved-by <id>]
```

The existing `run`, `job`, and `qc` placeholder commands remain NOT_IMPLEMENTED; this work did not silently broaden their scope.

## Story-plan execution boundary

`story generate` does not secretly attach an AI provider. It reads an operator-authored project-local `story-plan.json` and presents its structured Structure/Sequence/Scene decisions to the existing `StoryGenerationService`.

The existing Story validators remain authoritative. They enforce:

- at least one chapter;
- valid/contiguous chapter, sequence and scene order;
- valid chapter/sequence references;
- non-empty Scene stateIn/stateCurrent/stateOut;
- every sequence has at least one Scene;
- every Scene `scriptSegment` exists verbatim in the current approved FINAL script;
- script segments preserve their order in that script.

The CLI does not modify script text to force a plan through validation.

## Filesystem boundary

`--file` and `--plan` inputs must remain inside the current project workspace.

The implementation validates both the requested absolute path and filesystem realpath, blocking traversal and symlink escapes before reading the file.

Human prose fields such as title, factual statement, URL, citation and notes are treated as semantic content rather than executable runtime references. They are not mutated simply because the prose contains text that resembles a legacy path.

## Human approval contract

The accepted WF-07 approval gates remain intact:

```text
FACT
  -> source required
  -> DRAFT
  -> explicit approve

SCRIPT
  -> DRAFT/FINAL revision history
  -> only FINAL can be human-approved
  -> story generation blocked before FINAL human approval

STORY
  -> validated graph generation
  -> explicit structure approval
  -> explicit Scene approvals
```

A later approved FINAL script revision marks existing story structure stale according to the existing impact rules instead of deleting historical rows.

## Test evidence

### Integration CLI flow

The test suite creates a real unified SHORTFORM project and verifies in the same `project.db`:

```text
research source
  -> FACT DRAFT
  -> FACT APPROVED
  -> DRAFT script
  -> DRAFT approval BLOCKED
  -> FINAL revision
  -> pre-approval story generation BLOCKED
  -> FINAL human approval
  -> story graph generated
  -> structure human approval
  -> all Scene approvals
  -> story status reflects durable state
```

### Negative boundaries

Verified:

```text
FACT without source              BLOCKED
script input outside project     BLOCKED
DRAFT final approval             BLOCKED
story before FINAL approval      BLOCKED
semantic legacy-looking prose    ALLOWED AS CONTENT
```

### Revision behavior

A new FINAL script revision is approved after Story generation. Existing Chapters/Sequences are marked stale and previous Scene history remains present.

### Compiled public binary

The production-built `cli/vpf/dist/index.js` was executed as an external process against a temporary unified workspace. It successfully performed:

```text
project create
script create --kind FINAL
script approve
story generate
story approve-structure
story approve-scenes --all
story status
```

This proves the public binary route, not only direct TypeScript service calls.

## Regression result

Implementation CI `34563322345` at exact implementation HEAD `cf25b77457fb2ec6b0fd571de4aa16e43b65e5a6` passed all four jobs:

```text
pilot-readiness  PASS
e2e              PASS
validate (22)    PASS
validate (24)    PASS
```

Node 24 logs additionally confirmed:

```text
CLI tests                                      14 / 14 PASS
Generic Editor browser smoke                   PASS
actual GenericFinalRender MP4                  PASS
WF-17 Technical QC                             PASS
WF-18 package                                  PASS
repository legacy boundary scan                PASS
```

## Operator guide

See:

```text
docs/operations/WF07_CLI_GUIDE.md
```

for the real `pilot_short_01` PowerShell flow and the `story-plan.json` contract.

## Acceptance

```text
existing StoryPipeline reused                  PASS
existing StoryGenerationService reused         PASS
canonical SqliteStoryRepository reused         PASS
research/fact CLI                              PASS
script create/revise/final approval CLI        PASS
story plan generation CLI                      PASS
structure/Scene approval CLI                   PASS
same project.db authority                      PASS
project-local file containment                 PASS
symlink escape protection                      PASS
human approval gates preserved                 PASS
script revision staleness preserved            PASS
compiled public CLI E2E                        PASS
MIG-12 fixture E2E regression                  PASS
MIG-13 pilot-readiness regression              PASS
Node 22 full regression                        PASS
Node 24 full regression                        PASS
```

Result: **WF-07 production CLI entrypoint is ready for the real SHORTFORM pilot.**
