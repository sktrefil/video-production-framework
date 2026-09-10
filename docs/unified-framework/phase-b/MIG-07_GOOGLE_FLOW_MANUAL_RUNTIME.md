# MIG-07 — Google Flow Manual Runtime

Status: **WORK ORDER / NOT YET EXECUTED**

## WORK ITEM

`MIG-07`

## GOAL

Make Google Flow a first-class `MANUAL_EXTERNAL` video runtime so WF-11 jobs
can be executed and re-imported without creating a side workflow.

## WHY

WF-11 already owns clip design/provider jobs. The current operational process
uses Flow manually. The unified system should model that honestly rather than
pretend an unsupported stable automation API exists.

## SOURCE

Canonical target:
- `packages/final-clip/**`
- `packages/prelink-handoff/**`
- `packages/qc-fallback/**`
- MIG-02 runtime contracts.

Old spreadsheets/manual prompt files are examples only, not state authority.

## TARGET

```
runtimes/google-flow/
cli/vpf/
workspace/projects/<id>/jobs/<job_id>/
```

## CLASSIFICATION

```
NEW_BUILD
```

## DEPENDENCIES

- MIG-01 ... MIG-06 PASS.

## FILES TO READ FIRST

- `packages/final-clip/src/index.ts`
- `packages/qc-fallback/src/index.ts`
- `packages/domain/src/index.ts`
- Phase A Runtime Resource contract.

## IN SCOPE

### Export command

Target:
```powershell
vpf job export <job_id>
```

For `DIRECT_START_END_I2V` export:
- runtime_job.json,
- prompt.txt,
- exact START image,
- exact END image,
- instructions.

For `SINGLE_IMAGE_I2V`:
- runtime_job.json,
- prompt.txt,
- exact source image,
- instructions.

### Export package rules

Package contains:
- job ID/revision/attempt,
- clip ID/revision,
- exact provider profile,
- exact duration,
- exact source hashes,
- exact provider execution prompt,
- expected output type/name.

Package contains no:
- API keys,
- cookies,
- session state,
- unrelated project files.

### Import command

Target:
```powershell
vpf job import-result <job_id> <generated.mp4>
```

Validate:
- job is current,
- WAITING_EXTERNAL,
- target clip revision current,
- source job input hash unchanged,
- MP4 readable,
- basic duration/dimensions available,
- result copied into project workspace,
- checksum written.

Then:
- RuntimeResult COMPLETE,
- candidate VIDEO MediaArtifact,
- clip candidate,
- WF-12 QC pending.

## OUT OF SCOPE

- browser automation,
- automated Google login,
- UI click scripting,
- automatic Flow account/session management,
- clip approval.

## PORT ITEMS

None required.

## ADAPT ITEMS

Existing spreadsheet column concepts may inform operator-facing export, but JSON
RuntimeJob is authoritative. XLSX is optional convenience output only.

## NEW BUILD ITEMS

- Flow manual executor/exporter,
- secure job package builder,
- MP4 importer/prober,
- CLI export/import commands,
- stale result protection,
- operator instructions template.

## LEGACY / DO NOT PORT

- manual file naming as workflow state,
- spreadsheet status as canonical state,
- old prompt generator,
- any tool that regenerates clip design during export.

## CONTRACTS THAT MUST NOT CHANGE

- only provider-execution clip modes create Flow jobs.
- EDITORIAL_MOVE/STATIC_HOLD/REUSE_REFRAME/CUT bypass Flow.
- WF-12 decides PASS/TRIM_PASS/EDITORIAL_FIX/REGENERATE/FALLBACK/BLOCKED.
- imported MP4 is candidate only.

## IMPLEMENTATION STEPS

1. Add manual runtime executor registration for GOOGLE_FLOW.
2. Implement job package generation.
3. Copy source media after verifying MediaArtifact checksum.
4. Write exact prompt.txt and runtime_job.json.
5. Add human-readable INSTRUCTIONS.md.
6. Implement result import.
7. Probe/hash/copy result into canonical project clip media path.
8. Ingest as candidate VIDEO.
9. Transition into WF-12 QC.
10. Add stale job/result tests.
11. Add secret-export scan.
12. Add optional operator summary command.

## TESTS

- START/END pair exported exactly.
- single-image source exported exactly.
- prompt unchanged.
- source hashes match.
- secret scan zero.
- wrong job ID rejected.
- stale clip revision rejected.
- non-MP4/wrong media rejected.
- imported candidate reaches WF-12.
- result does not auto-approve.
- editorial modes do not generate Flow package.

## ACCEPTANCE CRITERIA

- manual Flow is a normal runtime mode: PASS.
- no parallel spreadsheet state required: PASS.
- exact source/prompt preservation: PASS.
- import integrity: PASS.
- WF-12 route: PASS.
- secret package leak: ZERO.
- browser automation dependency: ZERO.
- full regression: PASS.

## ROLLBACK

Disable/remove GOOGLE_FLOW manual executor and CLI commands; return to MIG-06
accepted HEAD. Exported test job folders may be safely deleted.

## BRANCH

```
migration/mig-07-google-flow-manual
```

## NEXT

```
MIG-08 — Generic Editor Port
```
