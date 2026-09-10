# Unified Project Bootstrap + CLI v1

Status: **MIG-04 IMPLEMENTED**

## Public entry point

```text
vpf project create <project_id> --title "..." --format longform
vpf project create <project_id> --title "..." --format shortform
vpf project status <project_id>
vpf project doctor <project_id>
vpf doctor <project_id>
```

User format values are normalized only at the CLI/application boundary:

```text
longform  -> LONGFORM
shortform -> SHORTFORM
```

The canonical domain values remain unchanged.

## Bootstrap transaction boundary

A new project is assembled under a staging directory first:

```text
validate project id/title/format
        ↓
create staging workspace
        ↓
apply migrations 0001..current
        ↓
resolve canonical resource selections
        ↓
pin exact resource version + SHA-256
        ↓
insert ProjectRecord into project.db
        ↓
write validated project.json snapshot
        ↓
atomic rename to workspace/projects/<project_id>
```

If any step fails, the staging directory is removed. A partially initialized
project is not promoted to the final project path.

## Runtime layout

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

`VPF_WORKSPACE_ROOT` or an explicit workspace root may move the physical
workspace. Stored media paths remain project-relative.

Windows drive-root paths are preserved by the workspace resolver without
breaking native POSIX absolute paths used by CI/server environments.

## Database migration runner

Fresh project DB creation applies the repository migration set in one immediate
transaction.

The runner requires a contiguous sequence beginning at `0001`, records exact
migration filename and SHA-256 in `schema_migrations`, and rejects checksum
drift.

MIG-04 adds:

```text
0014_project_bootstrap.sql
```

with the canonical unified `projects` table.

The project row stores:

- stable ProjectRecord identity/revision/lifecycle,
- title,
- canonical format,
- VersionPins,
- exact ResourcePin snapshots,
- `pipeline = VPF_UNIFIED_V1`,
- `legacy_allowed = 0`.

The DB constraint prevents a unified project row from enabling legacy execution.

## Project Style policy

Bootstrap does not fabricate or approve Project Style.

The initial pin is:

```text
projectStyleVersion = UNMATERIALIZED
```

and the fresh DB contains no Project Style row. WF-08 remains responsible for
materializing and approving Project Style.

## Canonical resource resolution

New project creation starts from the explicitly versioned bootstrap selection:

```text
HISTORY_MYSTERY_V1@1.1.0
```

and resolves/pins:

- Channel Profile,
- History/Mystery Channel Visual Bible,
- Production Rule Registry,
- selected LONGFORM or SHORTFORM Format Profile,
- TTS Provider Profile,
- Image Provider Profile,
- Manual Video Provider Profile,
- Final Render Provider Profile.

Each resource pin stores resource type, ID, version and SHA-256 content hash.

MIG-04 adds the bootstrap-required canonical rule resource:

```text
PRODUCTION_RULE_REGISTRY_V1@1.0.0
```

and introduces:

```text
HISTORY_MYSTERY_V1@1.1.0
```

as an explicit new Channel Profile revision that selects that Rule Registry.

The accepted MIG-03 file `HISTORY_MYSTERY_V1@1.0.0` is preserved byte-for-byte.
MIG-04 does not rewrite the content of an existing resource version to add a new
selection. This keeps existing version+hash pins valid and preserves the MIG-03
no-silent-upgrade contract.

Existing projects do not auto-upgrade when resources change.

## project.json

`project.json` is an exchange/config snapshot, not workflow state.

It contains:

- schemaVersion,
- project identity/title/format/revision,
- pipeline marker,
- `legacyAllowed=false`,
- VersionPins,
- exact ResourcePins.

`project status` reads the authoritative ProjectRecord from `project.db`.

Doctor compares `project.json` back to the DB and reports drift instead of
treating JSON as a second database.

## Doctor

Doctor verifies:

- project.db exists and is readable,
- active ProjectRecord exists,
- every migration is current and checksum-matched,
- project.json matches DB identity/pins,
- all required standard directories exist,
- every resource version/hash pin resolves exactly,
- `pipeline=VPF_UNIFIED_V1`,
- `legacyAllowed=false`,
- bootstrap/status/doctor require no old-repository runtime path.

## Future CLI commands

The unified contract reserves `run`, `job`, and `qc` families.

Until their owning migration supplies real application services they fail with:

```text
NOT_IMPLEMENTED
```

They never return simulated success.
