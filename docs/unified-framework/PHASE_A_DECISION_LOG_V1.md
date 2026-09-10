# PHASE A — Architecture Decision Log v1

Status: **FROZEN FOR PHASE B**

## ADR-A01 — One repository is the production system

Decision:

```
video-production-framework
```

becomes the single integrated production repository.

Reason:

Two repositories acting as active production systems create duplicate rules,
paths, versioning and operational steps.

Rejected:

Keep Framework and manager-v2 as permanent peers.

---

## ADR-A02 — Preserve good execution code, not old decision authority

Decision:

Use PORT/ADAPT for proven execution/editor code and NEW_BUILD for missing unified
capabilities.

Rejected:

- rewrite everything from scratch,
- copy the entire old repository into the new repository.

---

## ADR-A03 — Framework owns all creative/production decisions

Decision:

Visual Bible, Project Style, Identity Anchor, Scene/Asset Design, clip design,
fallback and QC remain Framework/Production-System responsibilities.

Runtime adapters are execution-only.

Rejected:

Provider runtime adds an old style prompt or independently reinterprets a scene.

---

## ADR-A04 — New image runtime is built fresh

Decision:

Do not port the legacy high-level image planning stack.

Build a thin executor around the Framework-compiled prompt.

Reason:

The old stack is heavily coupled to historical styles, master references and
legacy project behavior.

---

## ADR-A05 — ElevenLabs is adapted, not rewritten unnecessarily

Decision:

Reuse the already proven request/chunk/alignment implementation behind the new
runtime contract.

Reason:

It is provider execution code with useful production-tested behavior.

The old monolithic CLI remains legacy.

---

## ADR-A06 — Generic Editor moves into the unified repository

Decision:

Port/adapt the Generic Editor and Remotion runtime under `apps/editor`.

Reason:

The editor is already the validated target of WF-14~WF-18 and is generic enough
to remain a reusable application.

---

## ADR-A07 — Manual external provider is a supported execution mode

Decision:

Do not fake automation where no stable API/runtime exists.

Google Flow starts as a first-class `MANUAL_EXTERNAL` adapter.

Manual results still enter MediaArtifact + QC normally.

---

## ADR-A08 — project.db remains canonical state

Decision:

Do not make editor JSON, job JSON or filesystem folders an alternate database.

JSON files are exchange/materialization snapshots.

---

## ADR-A09 — Workspace is inside the unified operational model but outside Git

Decision:

Default:

```
workspace/projects/<project_id>
```

with `VPF_WORKSPACE_ROOT` override.

Reason:

One-repository operation without committing large media/project DBs.

---

## ADR-A10 — Editor public project files are materialized, not canonical

Decision:

Framework workspace holds the canonical editor exchange snapshot.
`apps/editor/public/projects/<id>` is a generated runtime mirror.

Reason:

Avoid editor-specific static serving constraints becoming the project source of
truth.

---

## ADR-A11 — Long-form first, short-form as profile

Decision:

One visual/production architecture with format profiles.

Rejected:

Independent old shorts visual engine and separate long-form visual engine.

---

## ADR-A12 — Legacy isolation is enforced in code

Decision:

New projects set:

```
pipeline = VPF_UNIFIED_V1
legacyAllowed = false
```

and the system blocks legacy style/planner/master/runtime use.

Rejected:

Rely on developer memory/documentation only.

---

## ADR-A13 — Migration is gated and additive

Decision:

No source deletion before:

- migrated tests PASS,
- single-repo E2E PASS,
- REAL PROJECT PASS.

Reason:

Maintain rollback and compare behavior during transition.

---

## ADR-A14 — Phase B produces work orders before implementation

Decision:

After Phase A, produce explicit MIG-01 ... MIG-13 work instructions.

Each instruction must state:

- what is ported,
- what is adapted,
- what is newly built,
- what remains legacy,
- exact acceptance gates.

Implementation begins only from those work orders.
