# MIG-04 — Project Bootstrap + Unified CLI Foundation

Status: **WORK ORDER / NOT YET EXECUTED**

## WORK ITEM

`MIG-04`

## GOAL

Create SHORTFORM and LONGFORM unified projects from the new repository with one
public CLI and one project.db.

## WHY

The old HISTORY_MYSTERY project creation entrypoint is SHORTS-only and belongs
to the old monolithic control plane. The unified framework must bootstrap both
formats natively before real migration validation can begin.

## SOURCE

Canonical target:
- `packages/domain/src/index.ts`
- all migrations `0001 ... current`
- MIG-01 workspace resolver
- MIG-03 resource registry

Old repo for behavior/reference only:
- `main.py`
- `src/lived_sentences/cli.py`
- `src/lived_sentences/history_project_command.py`

## TARGET

```
packages/project-bootstrap/
packages/workspace/
cli/vpf/
workspace/projects/<project_id>/
```

## CLASSIFICATION

```
NEW_BUILD
```

## DEPENDENCIES

- MIG-01 PASS.
- MIG-02 PASS.
- MIG-03 PASS.

## FILES TO READ FIRST

- `packages/domain/src/index.ts`
- `migrations/*.sql`
- `packages/storage/**`
- Phase A project bootstrap section.
- Old `history_project_command.py` only to understand previous constraints,
  not to copy its SHORTS-only assumptions.

## IN SCOPE

### Project create

Target command:

```powershell
vpf project create <project_id> --title "..." --format longform
vpf project create <project_id> --title "..." --format shortform
```

Normalize CLI user values into canonical domain:
- `longform` → `LONGFORM`,
- `shortform` → `SHORTFORM`.

### Bootstrap artifacts

Create:

```
workspace/projects/<id>/
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

### ProjectRecord

Persist:
- project ID,
- title,
- format,
- stable revision/lifecycle fields,
- all required VersionPins.

### Version pins

At creation resolve:
- framework/data model version,
- Channel Visual Bible,
- Production System,
- rule registry,
- format profile,
- required provider profiles,
- Project Style placeholder/version policy as required by current domain.

Do not create fake approved Project Style.

### Legacy marker

Create:

```
pipeline = VPF_UNIFIED_V1
legacyAllowed = false
```

in validated project config/exchange data and enforce through project context.

### CLI foundation

Required public commands:
- `vpf project create`
- `vpf project status`
- `vpf doctor` or `vpf project doctor`

Optional initial stubs may expose future command names but must fail clearly as
NOT_IMPLEMENTED rather than pretending execution occurred.

## OUT OF SCOPE

- real research generation,
- real TTS execution,
- image generation,
- Flow,
- editor migration.

## PORT ITEMS

None as public control-plane code.

## ADAPT ITEMS

Narrow utility concepts may be reused:
- safe UTF-8 console behavior,
- robust project ID sanitization,
- atomic writes.

Only if decoupled from old state/CLI.

## NEW BUILD ITEMS

- project bootstrap service,
- DB migration runner,
- project config serializer/validator,
- CLI parser/commands,
- project status reader,
- doctor diagnostics,
- project lock only if required for safe concurrent creation.

## LEGACY / DO NOT PORT

- old history project command,
- SHORTS-only project creation assumptions,
- old project_state.json state machine,
- old CLI as public entrypoint.

## CONTRACTS THAT MUST NOT CHANGE

- ProjectFormat domain values.
- project.db source of truth.
- migrations are applied transactionally.
- resource pins are immutable until explicit upgrade.
- project.json is not a second state database.

## IMPLEMENTATION STEPS

1. Implement DB migration runner for a fresh project DB.
2. Implement ProjectRecord repository if not already complete.
3. Implement resource-pin resolver.
4. Implement project folder bootstrap.
5. Implement project.json exchange snapshot.
6. Implement CLI binary/runner.
7. Implement status command from DB.
8. Implement doctor:
   - DB exists/readable,
   - migrations current,
   - resource pins resolvable,
   - project directories safe,
   - legacyAllowed=false,
   - no source-repo dependency.
9. Add SHORTFORM fixture creation.
10. Add LONGFORM fixture creation.
11. Run full regression.

## TESTS

- create SHORTFORM.
- create LONGFORM.
- duplicate project ID rejected.
- traversal project ID rejected.
- invalid format rejected.
- all migrations applied.
- resource pins and hashes written.
- project.json matches DB identity/pins.
- `legacyAllowed=false`.
- external workspace root works on Windows-style path.
- no old repo required.

## ACCEPTANCE CRITERIA

```
vpf project create ... --format shortform  PASS
vpf project create ... --format longform   PASS
single project.db                          PASS
resource pins                              PASS
legacy disabled                            PASS
doctor                                     PASS
old repository dependency                  ZERO
full framework regression                  PASS
```

## ROLLBACK

Delete only test/fixture workspaces and revert MIG-04 code to MIG-03 accepted
HEAD. Do not delete shared resource files from MIG-03.

## BRANCH

```
migration/mig-04-project-bootstrap-cli
```

## NEXT

```
MIG-05 — ElevenLabs Runtime Migration
```
