# TEST-09 — Editor Materialization + Render Runtime

Owner: MIG-09

## Goal
Validate DB-to-editor materialization, actual GenericFinalRender execution, technical QC/delivery, and publish handoff boundaries.

## Validate
- editor materializer produces deterministic project snapshot/hash,
- missing/stale inputs fail correctly,
- ProjectRenderer/GenericFinalRender consumes the materialized project,
- render runtime executes in CI-capable smoke/E2E path,
- output technical QC is enforced,
- WF-17 delivery and WF-18 package handoff are produced only after required gates,
- package hashes and output references are valid,
- render does not require old repository assets.

## Negative checks
Materialization hash mismatch, missing media, path escape, stale project snapshot, failed technical QC.

## Repair rule
Implementation/harness defects may be repaired automatically with regression coverage.

## PASS criteria
Materialization through final render/output handoff is deterministic and gate-safe.

## Next
PASS -> TEST-10.