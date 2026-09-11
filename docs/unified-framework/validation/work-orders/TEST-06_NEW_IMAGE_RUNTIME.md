# TEST-06 — New Image Runtime

Owner: MIG-06

## Goal
Validate the new image runtime path with exact prompt/reference transport and zero legacy style injection.

## Validate
- IMAGE_PROMPT semantic text reaches execution unchanged,
- reference hashes/identity are preserved,
- Format Profile dimensions are enforced,
- automated/manual execution boundaries use shared runtime contracts,
- provider result becomes candidate MediaArtifact only,
- IMAGE_QC remains separate authority,
- legacy image planner/master style/palette is not consulted,
- process/runtime/storage integration tests pass.

## Negative checks
Attempt legacy resource/path injection, malformed reference hashes, invalid dimensions, and provider-side creative mutation; all must fail closed or be rejected by the correct boundary.

## Repair rule
Implementation defects may be repaired automatically; changing approved Visual Bible semantics or immutable resources requires review.

## PASS criteria
New image generation is canonical-resource driven, exact-input preserving, candidate-only, and legacy-isolated.

## Next
PASS -> TEST-07.