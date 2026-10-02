# Integrated History Video Skill Validation v1.1

## Scope

Validated the integrated development stack:

- `history-mystery-scriptwriter`
- `history-video-development-director`
- `history-fantasy-storyboard-director`
- `render-polish-skill`
- Agent1 / story_audio / visual_image integration rules

Target: **>=98/100 structural package quality**.

## Result

**99/100 — PASS**

This score measures skill architecture, contracts, provenance protection, revision routing, validation coverage, and production-readiness rules. It does not claim measured YouTube retention/CTR performance; that requires published-video analytics.

## Rubric

| Area | Weight | Score |
|---|---:|---:|
| Authority / workflow separation | 10 | 10 |
| Script + directing co-development | 15 | 15 |
| Attention / event-density / ending rules | 15 | 15 |
| Directing Preflight + sequence gates | 15 | 15 |
| SCRIPT_DIRECTING_LOCK provenance | 10 | 10 |
| FINAL_TTS_GATE stale-artifact protection | 15 | 15 |
| Render Polish lock-lineage protection | 10 | 10 |
| Validator negative-case coverage / recovery routing | 5 | 5 |
| Structural E2E flow | 5 | 4 |
| **Total** | **100** | **99** |

One E2E point is reserved for real-world audience-performance validation after actual production.

## Structural Validation Scenarios

Expected PASS:
1. script candidate with directability/attention/final-quarter fields
2. directing preflight with valid unit and sequence reviews
3. script-directing lock with matching revision/hash/unit provenance
4. FINAL_TTS_GATE with matching current + locked + Agent1-approved provenance
5. INTEGRATED render-polish contract with immutable lock IDs
6. Oase-style structural E2E flow with two resolved development revision rounds

Expected BLOCK:
7. FINAL TTS marked generated during script development
8. information-unit count materially exceeds visual-event budget without justification
9. first meaningful attention event exceeds 4s without exception
10. final quarter does not recover Theme Spine / meaning
11. prohibited FINAL_TTS nested anywhere inside Directing Preflight payload
12. sequence block repeats explanatory motif / scale / static abstraction without revision or exception
13. preflight input script hash differs from SCRIPT_DIRECTING_LOCK
14. current script hash differs at FINAL_TTS_GATE
15. Agent1 Story Gate is not PASS at FINAL_TTS_GATE
16. INTEGRATED Render Polish changes VISUAL_BEAT_LOCK_ID
17. integrated E2E manifest carries stale script provenance

Result: **17/17 expected outcomes matched in contract simulation.**

## Key Improvements Since Previous Review

- added timed Attention Contract rather than text-only attention labels
- added information-unit / visual-event budget
- added Final-Quarter Theme Spine gate
- added 20-30s sequence hard gates to Directing Preflight
- changed prohibited Preflight output checking to recursive contract policy
- added revision/hash/unit provenance consistency to SCRIPT_DIRECTING_LOCK
- added mandatory FINAL_TTS_GATE after Agent1 Story Gate
- added stale script/preflight/visual-skeleton detection immediately before TTS
- made `history-video-development-director` the required history/mystery LONGFORM development workflow authority while retaining Agent1 approval authority
- protected SCRIPT_DIRECTING_LOCK_ID and VISUAL_BEAT_LOCK_ID in INTEGRATED Render Polish mode
- added Oase-style structural E2E fixture and stale-provenance negative fixture

## Release Decision

**PASS for integrated pilot validation.**

Do not call the package audience-performance proven until at least one full pilot is produced and retention/editing feedback is compared against the preflight predictions.
