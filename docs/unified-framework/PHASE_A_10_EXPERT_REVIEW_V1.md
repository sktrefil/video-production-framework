# PHASE A — 10-Expert Architecture Review v1

Status: **PASS WITH IMPLEMENTATION CONDITIONS**

This review validates the Phase A target design before migration work orders are
written.

## 1. Software architecture

**PASS**

The design removes the permanent two-repository production split and establishes
one integrated repository with explicit module boundaries.

Required implementation condition:

- moving files must not collapse Control, Runtime and Editor responsibilities
  into one module.

---

## 2. Workflow / orchestration architecture

**PASS**

WF-07 through WF-18 remain the canonical state machine and approval/QC model.

Required implementation condition:

- Runtime completion may create candidate media but may never directly mark an
  Asset/Clip/Final Output approved.

---

## 3. Data architecture

**PASS**

`project.db` remains canonical for structured state while media/documents remain
on the filesystem with checksums and project-relative paths.

Required implementation condition:

- editor materialization, manual provider packages and JSON snapshots must never
  become alternate state databases.

---

## 4. Generative-AI / prompt architecture

**PASS**

The image/video runtime is deliberately thin and cannot inject old visual style
or reinterpret the scene.

Required implementation condition:

- add prompt-input hash tests and legacy-style leak tests before an image runtime
  can be accepted.

---

## 5. Visual production architecture

**PASS**

The authoritative visual chain is:

```
Channel Visual Bible
→ Project Style
→ Identity Anchors
→ Scene/State
→ Asset Design
→ Format Profile
→ Provider Prompt
→ Image QC
```

Required implementation condition:

- a real versioned Channel Visual Bible resource and format profiles must be
  authored/resolved in MIG-03; the current resource-port interface alone is not
  sufficient for real production.

---

## 6. Provider / MLOps architecture

**PASS**

Provider version pins, runtime registry, RuntimeJob/RuntimeResult, attempts,
input hashes and result checksums form a provider-neutral execution boundary.

Required implementation condition:

- the first implementation must support mocked CI execution and real local
  execution without changing the durable contract.

---

## 7. Editor / Remotion architecture

**PASS**

The Generic Editor is reused as a generic app rather than rewritten.

The design correctly makes the editor public directory a materialized execution
mirror, not the project source of truth.

Required implementation condition:

- Preview and Final Render must continue to use the same ProjectRenderer.

---

## 8. Security architecture

**PASS**

Secrets remain runtime-local and are represented durably only by secret names or
provider-profile requirements.

Required implementation condition:

- manual external job packages must have a security test proving no env values,
  cookies, tokens or session data are exported.

---

## 9. DevOps / migration architecture

**PASS**

The migration is additive, gated and reversible.

Required implementation condition:

- every MIG work item must preserve the source repository until its target slice
  passes target CI and the unified E2E gate.

---

## 10. Production operations

**PASS**

The target operator experience is a single repository and single CLI. Manual
Google Flow execution is modeled honestly as MANUAL_EXTERNAL rather than
pretending it is automated.

Required implementation condition:

- REAL PROJECT 01 must be executable without changing directory into the old
  repository.

---

# Cross-expert risks carried into Phase B

These are implementation requirements, not unresolved architecture decisions.

## R1 — Actual canonical Visual Bible resource

Current Framework has versioned resource ports but the migration program must
materialize the real approved channel Visual Bible under `resources/`.

Owner:

```
MIG-03
```

## R2 — Mixed TypeScript / Python TTS runtime

The existing ElevenLabs implementation is Python while Framework core is
TypeScript.

Decision:

- keep the runtime boundary JSON/process-safe,
- reuse Python initially,
- do not force a rewrite solely for language uniformity.

Owner:

```
MIG-05
```

## R3 — Windows large-media workspace

Project media may be too large for the source disk.

Decision:

- `VPF_WORKSPACE_ROOT` must support an external disk,
- DB stores project-relative paths,
- no source-repo absolute path may be persisted.

Owner:

```
MIG-01 / MIG-04
```

## R4 — Google Flow execution

No canonical automated Flow runtime is assumed.

Decision:

- ship MANUAL_EXTERNAL export/import first,
- add automation later only behind the same runtime contract.

Owner:

```
MIG-07
```

## R5 — Editor static-media requirement

Remotion/Studio currently reads project media from its public project area.

Decision:

- introduce deterministic editor materialization,
- verify source/destination checksums,
- treat the mirror as disposable.

Owner:

```
MIG-09
```

## R6 — Legacy leakage

The old repository has many image/visual planners and style resources.

Decision:

- do not rely on naming convention or developer memory,
- create an executable Legacy Guard and regression tests.

Owner:

```
MIG-11
```

# Expert review result

```
ARCHITECTURE                    PASS
WORKFLOW OWNERSHIP              PASS
DATA SOURCE OF TRUTH            PASS
GENERATIVE AI BOUNDARY          PASS
VISUAL AUTHORITY                PASS
PROVIDER / MLOPS                PASS
GENERIC EDITOR STRATEGY         PASS
SECURITY                        PASS
MIGRATION / ROLLBACK            PASS
PRODUCTION OPERATIONS           PASS

RESULT:
PASS WITH IMPLEMENTATION CONDITIONS
```

The design is sufficiently resolved to proceed to **PHASE B — Migration Work
Orders**.
