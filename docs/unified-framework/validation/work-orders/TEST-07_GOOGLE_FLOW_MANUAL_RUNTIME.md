# TEST-07 — Google Flow Manual Runtime

Owner: MIG-07
Historical status at validation start: `DEFERRED`.

## Goal
Resolve MIG-07 honestly by validating the provider-specific Google Flow manual export/import contract rather than inferring PASS from generic MANUAL_EXTERNAL fixture coverage.

## Validate
- `GOOGLE_FLOW_MANUAL_EXTERNAL_V1` profile resolves,
- export package includes only required non-secret execution data,
- START/END/single-image inputs and prompt identity are preserved,
- job identifiers allow deterministic result matching,
- imported results are validated before candidate MediaArtifact creation,
- manual import cannot bypass WF-12/QC,
- duplicate/wrong/missing result files fail safely,
- shared MANUAL_EXTERNAL path remains provider-neutral outside the profile/adapter boundary.

## Manual-provider boundary
Actual Google Flow UI generation may be `WAITING_EXTERNAL`; complete all automatable export/import fixture checks first. If live Flow evidence is required by the accepted MIG-07 criterion, provide exact operator handoff and resume on result import.

## Repair rule
Missing provider-specific adapter/export/import behavior is an implementation defect and may be repaired on the validation branch. Do not mark PASS merely because MIG-11/12 generic manual-path tests pass.

## PASS criteria
MIG-07 work-order acceptance is directly evidenced. If provider UI evidence remains mandatory and unavailable, status is `WAITING_EXTERNAL`, not PASS.

## Next
PASS -> TEST-08.