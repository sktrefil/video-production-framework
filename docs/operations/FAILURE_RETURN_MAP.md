# Failure Return Map

This map defines where a controlled pilot or REAL PROJECT 01 returns after a blocking defect. A failure never authorizes switching the same unified project to a previous production system.

| Failure / signal | Immediate action | Return-to stage | Resume condition |
|---|---|---|---|
| CI not green for exact HEAD | stop provider spend | repository/release gate | exact HEAD CI PASS |
| workspace below storage threshold | stop generation/render | environment preflight | free space above configured threshold |
| `RUNTIME_SECRET_MISSING` | stop automated provider execution | environment/provider configuration | required secret name present; `env check` PASS |
| image adapter missing/legacy path | stop image execution | environment/provider configuration | `VPF_IMAGE_ADAPTER_MODULE` readable and non-legacy |
| `RESOURCE_HASH_MISMATCH` / stale resource pin | stop downstream work | project bootstrap/resource pin owner | pin intentionally corrected through unified resource process; doctor/preflight PASS |
| project doctor failure / invalid `legacyAllowed` | stop all production | project bootstrap / MIG-04 or MIG-11 owner | doctor PASS with `VPF_UNIFIED_V1`, `legacyAllowed=false` |
| FINAL script changed after downstream generation | mark dependent work stale | WF-07 | new FINAL revision approved and dependents regenerated |
| TTS provider request failure | retry only per pinned provider policy | MIG-05 / TTS runtime | current RuntimeJob completes and audio artifact ingests |
| TTS chunk join/alignment mismatch | reject narration | MIG-05 / MIG-10 | full narration + alignment provenance PASS |
| human audio QC failure | reject current narration | TTS generation | approved replacement narration current to FINAL script |
| Project Style / Identity Anchor problem | stop Scene generation | WF-08 | required style/anchors approved |
| image reference SHA/dimension/MIME mismatch | reject provider result | MIG-06 / WF-09 | current IMAGE_GENERATION result validates |
| `IMAGE_QC` FAIL | reject/regenerate candidate | WF-09 | selected candidate IMAGE_QC PASS + explicit approval |
| WF-10 handoff failure | do not create final clip job | WF-10 / affected asset | handoff PASS with current approved media |
| Provider Pre-QC BLOCKED | do not export manual job | WF-11 design/provider selection | safe/compatible clip representation passes pre-QC |
| stale `MANUAL_EXTERNAL` result | reject import; never relabel | WF-11 current waiting job | result generated/imported for current job identity |
| clip QC REGENERATE/BLOCKED | follow recorded disposition | WF-11/WF-12 | replacement/alternative passes WF-12 |
| binding points to stale/unapproved media | block editor handoff | WF-13 | current approved media rebound; handoff READY |
| editor materialization hash mismatch | block editor/render | MIG-09 / source MediaArtifact owner | canonical source SHA matches DB and materialization PASS |
| missing A1/A2/A3/A4 or T1/T2/G1 coverage | block final render | WF-14~16 | assembly coverage complete and current |
| Generic Editor preview defect | classify by source | owning content/media/editor stage | corrected canonical state rematerialized and preview QC PASS |
| `TECHNICAL_QC` failure | block delivery | WF-17 / MIG-09 render owner | new actual render Technical QC PASS |
| final output QC failure | block package | WF-18 content/output QC | corrected render/output QC PASS |
| package hash/size mismatch | block handoff | WF-18 package materialization | package regenerated and all hashes verified |
| `publish_handoff.json` not READY | block release | WF-18 | current package + handoff READY |
| old repository/runtime becomes required | immediate NO-GO | owning MIG/new approved work item | unified path repaired; legacy dependency remains ZERO |
| major missing subsystem discovered | do not implement covertly in MIG-13 | owning MIG or approved new work item | subsystem implemented, regression + pilot gate PASS |

## Retry rules

Provider retries must preserve current approved semantic inputs and follow the pinned Provider Profile. Do not bypass safety/QC by changing job identity or silently substituting a result.

## Staleness rules

When an upstream revision changes, downstream artifacts are treated as stale according to their existing workflow contracts. Regenerate/rebind/rematerialize from the owning stage rather than editing database rows or exchange JSON by hand.

## Escalation record

For every blocking failure record project ID, repository HEAD, target entity/revision, error code, provider request ID if present, artifact SHA-256 if created, disposition, owning stage and the evidence used to resume.

The operational repository remains `video-production-framework` throughout recovery.
