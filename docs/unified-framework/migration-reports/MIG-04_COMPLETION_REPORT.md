# MIG-04 — Completion Report

Status: **PASS**

## WORK_ITEM

MIG-04 — Project Bootstrap + Unified CLI Foundation

## BRANCH

migration/mig-04-project-bootstrap-cli

## BASE_HEAD

c29b5f3f5f5859c03d8faa9eb97c42120e0fc286

## FINAL_IMPLEMENTATION_HEAD

19113a1083efc5d88775ea1b1ca1fb1c82091f24

## VALIDATED_IMPLEMENTATION_CI_RUN

34439271225

## CLASSIFICATION

NEW_BUILD + NARROW ADAPT

## PORT

None.

The old project creation command, old monolithic CLI, old project_state.json
workflow state, and SHORTS-only public control plane were not ported.

## ADAPT

Only existing unified repository contracts were reused:

- canonical `ProjectFormat` values,
- existing `ProjectRecord` / `VersionPins`,
- MIG-01 workspace resolver,
- MIG-03 resource registry and content-hash contract,
- existing repository SQL migrations,
- repository-boundary guard.

The workspace resolver received a narrow compatibility fix so Windows drive-root
workspace paths and native POSIX absolute paths are both classified correctly.

## NEW_BUILD

### Project bootstrap

- `packages/project-bootstrap`
- `ProjectBootstrapService`
- safe project ID/title/format validation
- SHORTFORM/LONGFORM normalization
- staging-directory bootstrap
- atomic final project promotion
- rollback cleanup after failed bootstrap
- standard project directory materialization
- ProjectRecord persistence
- project.json exchange snapshot
- status reader from project.db
- doctor diagnostics

### DB migration foundation

- `migrations/0014_project_bootstrap.sql`
- unified `projects` table
- `pipeline = VPF_UNIFIED_V1`
- `legacy_allowed = 0` database constraint
- schema_migrations receipt table created by migration runner
- contiguous migration sequence validation
- migration filename/SHA-256 pinning
- transactional fresh DB migration
- migration-current inspection

### Resource bootstrap

- Channel Profile driven resource selection
- exact version + SHA-256 ResourcePins
- VersionPins resource hash population
- canonical format selection by LONGFORM/SHORTFORM
- all required Provider Profile pins
- Channel Profile pin
- Channel Visual Bible pin
- Rule Registry pin
- Format Profile pin
- `PRODUCTION_RULE_REGISTRY_V1@1.0.0`
- `HISTORY_MYSTERY_V1@1.1.0` as the explicit Channel Profile revision selecting the Rule Registry
- accepted `HISTORY_MYSTERY_V1@1.0.0` preserved byte-for-byte

### Unified CLI

- `cli/vpf`
- package binary name: `vpf`
- `vpf project create`
- `vpf project status`
- `vpf project doctor`
- `vpf doctor`
- explicit NOT_IMPLEMENTED result for future `run`, `job`, and `qc`
- compiled CLI binary integration test

## LEGACY_NOT_PORTED

MIG-04 does not use:

- old `main.py` public control plane,
- old history project command,
- old lived-sentences CLI workflow,
- old project_state.json,
- old SHORTS-only bootstrap assumptions,
- old repository runtime paths,
- legacy style/master resources.

Unified project creation requires no checkout or runtime read from the migration
source repository.

## PROJECT_CREATE

Supported public forms:

```text
vpf project create <project_id> --title "..." --format shortform
vpf project create <project_id> --title "..." --format longform
```

Normalization:

```text
shortform -> SHORTFORM
longform  -> LONGFORM
```

Both formats are first-class unified projects.

## BOOTSTRAP_LAYOUT

Each successful project contains exactly one authoritative project DB:

```text
workspace/projects/<project_id>/
├─ project.json
├─ project.db
├─ 01_research/
├─ 02_script/
├─ 03_tts/
├─ 04_visual_identity/
├─ 05_images/
├─ 06_clips/
├─ 07_audio/
├─ 08_editor/
├─ 09_render/
├─ 10_publish/
├─ jobs/
└─ logs/
```

The physical root can move through `VPF_WORKSPACE_ROOT` or an explicit
workspace option.

## BOOTSTRAP_ATOMICITY

Project creation occurs in a staging directory:

```text
validate input
→ create staging project
→ migrate fresh project.db
→ resolve canonical resources
→ persist ProjectRecord
→ write project.json
→ atomic rename to final project directory
```

Failure before the final rename removes the staging directory.

Duplicate final project IDs are rejected rather than overwritten.

## PROJECT_DB

Fresh projects apply:

```text
0001
...
0014
```

The runner requires a contiguous migration sequence beginning at 0001.

All pending migrations are applied inside one `BEGIN IMMEDIATE` transaction.

`schema_migrations` records:

- migration ID,
- exact filename,
- SQL SHA-256,
- applied timestamp.

A changed checksum for an already applied migration is rejected.

MIG-04 adds the `projects` table containing:

- ProjectRecord stable ID/project ID,
- revision/lifecycle,
- title,
- canonical format,
- VersionPins JSON,
- exact ResourcePins JSON,
- unified pipeline marker,
- legacy-disabled marker,
- timestamps.

## PROJECT_STYLE_POLICY

MIG-04 does not create a fake Project Style.

Fresh VersionPins contain:

```text
projectStyleVersion = UNMATERIALIZED
```

and the fresh `project_styles` table contains zero rows.

WF-08 remains the sole owner of Project Style materialization and approval.

## RESOURCE_PINS

New project bootstrap begins from:

```text
HISTORY_MYSTERY_V1@1.1.0
```

and pins exact version/hash for:

- HISTORY_MYSTERY_V1 Channel Profile,
- HISTORY_MYSTERY_VISUAL_BIBLE,
- PRODUCTION_RULE_REGISTRY_V1,
- LONGFORM_16X9_V1 or SHORTFORM_9X16_V1,
- ELEVENLABS_V3_HISTORY_V1,
- IMAGE_PROVIDER_EXECUTION_V1,
- GOOGLE_FLOW_MANUAL_EXTERNAL_V1,
- REMOTION_FINAL_RENDER_V1.

The resulting `VersionPins.resourceHashes` is populated at project creation.

Resource upgrades remain explicit; project bootstrap has no automatic upgrade
path.

## CANONICAL RESOURCE VERSION IMMUTABILITY — REGRESSION FOUND AND FIXED

During MIG-04 scope audit, the branch was found to have added `ruleRegistry`
directly to the already accepted canonical file:

```text
HISTORY_MYSTERY_V1@1.0.0
```

That would change the content hash of an existing version and make MIG-03
version+hash pins stale without an explicit resource upgrade.

The issue was corrected before MIG-04 acceptance:

```text
HISTORY_MYSTERY_V1@1.0.0
→ restored to the exact MIG-03 accepted bytes

HISTORY_MYSTERY_V1@1.1.0
→ new explicit version
→ adds PRODUCTION_RULE_REGISTRY_V1@1.0.0 selection

MIG-04 bootstrap default
→ explicitly moved to HISTORY_MYSTERY_V1@1.1.0
```

A regression test now verifies the exact accepted SHA-256 of the 1.0.0 file and
proves new projects pin 1.1.0 instead of mutating 1.0.0.

This preserves the MIG-03 rule:

```text
same resourceId + same version
→ same canonical bytes/hash
```

## RULE_REGISTRY

MIG-04 supplies the canonical Rule Registry required by the bootstrap work
order:

```text
PRODUCTION_RULE_REGISTRY_V1@1.0.0
```

Its initial hard invariants are limited to already approved architecture rules:

- project.db is structured-state authority,
- resource upgrades are explicit,
- legacy execution is disabled for unified projects,
- runtime completion never creates approval.

It does not duplicate channel visual style or provider execution configuration.

## PROJECT_JSON

`project.json` is a validated exchange/config snapshot only.

It contains:

- schemaVersion 1,
- project identity/title/format/revision,
- `pipeline = VPF_UNIFIED_V1`,
- `legacyAllowed = false`,
- VersionPins,
- exact ResourcePins.

`project status` reads the ProjectRecord from `project.db`, not from JSON.

Doctor verifies that project.json still matches the authoritative DB
identity/pins.

## LEGACY_ISOLATION

Legacy is disabled at two levels:

```text
project.json
legacyAllowed = false

project.db
legacy_allowed = 0
CHECK(legacy_allowed = 0)
```

The ProjectRecord reader rejects a row that is not on `VPF_UNIFIED_V1` or
attempts to enable legacy mode.

The repository-boundary test remains PASS.

## DOCTOR

Implemented checks:

- project.db exists/readable,
- active ProjectRecord readable,
- migration set current,
- migration checksums current,
- project.json matches DB,
- required project directories exist,
- all exact resource version/hash pins resolve,
- unified pipeline marker is present,
- legacy is disabled,
- bootstrap/status/doctor contain no old-repository runtime dependency.

## WINDOWS / EXTERNAL WORKSPACE

The workspace resolver distinguishes native absolute paths before evaluating
Windows drive-style absolute paths.

This preserves Linux/server behavior such as:

```text
/tmp/...
```

while also validating Windows roots such as:

```text
D:\VPF Workspace
```

without converting the former into a Windows-style path.

An integration fixture also creates a project under an absolute external
workspace root.

## VALIDATION

Validated GitHub Actions:

```text
run: 34439271225
head: 19113a1083efc5d88775ea1b1ca1fb1c82091f24
```

Node 22:
- npm install: PASS
- build: PASS
- typecheck: PASS
- test: PASS

Node 24:
- npm install: PASS
- build: PASS
- typecheck: PASS
- test: PASS

Test groups:

- Runtime Contracts: 7 / 7 PASS
- Provider Orchestrator: 5 / 5 PASS
- Resource Registry: 7 / 7 PASS
- Project Bootstrap: 9 / 9 PASS
- Unified CLI: 4 / 4 PASS
- Production System: 6 / 6 PASS
- Story: 5 / 5 PASS
- Visual Identity: 6 / 6 PASS
- Scene Assets: 8 / 8 PASS
- Pre-Link/Handoff: 8 / 8 PASS
- Final Clip: 9 / 9 PASS
- QC/Fallback: 6 / 6 PASS
- Media Binding: 6 / 6 PASS
- Editor Timeline: 13 / 13 PASS
- Final Render: 7 / 7 PASS
- Final Output: 6 / 6 PASS
- TTS Generation: 7 / 7 PASS
- Storage: 8 / 8 PASS
- Workspace: 7 / 7 PASS

TOTAL:

- 134 / 134 PASS

Repository boundary:

- no hardcoded legacy operational repository path: PASS

## ACCEPTANCE

- `vpf project create ... --format shortform`: PASS
- `vpf project create ... --format longform`: PASS
- compiled public CLI binary execution: PASS
- one project.db per project: PASS
- all migrations through 0014 applied: PASS
- migration transaction/checksum tracking: PASS
- ProjectRecord persisted: PASS
- resource versions pinned: PASS
- resource SHA-256 hashes pinned: PASS
- immutable accepted resource version preserved: PASS
- explicit Channel Profile 1.1.0 upgrade: PASS
- Rule Registry pinned: PASS
- project.json matches DB identity/pins: PASS
- no fake Project Style created: PASS
- `legacyAllowed=false`: PASS
- DB legacy constraint: PASS
- duplicate project ID rejected: PASS
- traversal project ID rejected: PASS
- invalid format rejected: PASS
- external workspace root: PASS
- Windows drive-root path handling: PASS
- `vpf project status` reads DB: PASS
- doctor: PASS
- old repository dependency: ZERO
- full framework regression: PASS

## KNOWN_ISSUES

None blocking MIG-05.

The CLI intentionally does not execute research, TTS, image, video, editor,
render, QC, or publish workflows in MIG-04. Future command families return
`NOT_IMPLEMENTED` until their owning migration connects the real application
service.

The initial project-level `projectStyleVersion` is `UNMATERIALIZED`; this is a
bootstrap sentinel, not an approved style resource. WF-08 owns the later
materialized style revision.

The review-only legacy source path named in the work order is not present at the
same path on the current migration-source main branch. MIG-04 has no runtime or
build dependency on it.

## ROLLBACK_POINT

c29b5f3f5f5859c03d8faa9eb97c42120e0fc286

## NEXT_WORK_ITEM

MIG-05 — ElevenLabs Runtime Migration

## RESULT

PASS
