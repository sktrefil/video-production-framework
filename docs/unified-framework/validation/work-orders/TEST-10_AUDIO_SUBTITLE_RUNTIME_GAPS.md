# TEST-10 — Audio + Subtitle Runtime Gaps

Owner: MIG-10

## Goal
Validate the closed audio/subtitle integration gaps and preserve the single authority for placement/timing.

## Validate
- approved A1/A2/A3/A4 audio paths,
- T1/T2 subtitle paths,
- G1 graphics/overlay integration where specified,
- manual audio import validation and project policy guard,
- TTS/subtitle alignment bridge,
- subtitle correction behavior,
- no duplicate timing authority outside the accepted WF-16/editor timeline boundary,
- editor render parity for audio/subtitle data.

## Negative checks
Missing/stale media, invalid timing, policy-missing project, path escape and duplicate authority must fail safely.

## Repair rule
Implementation defects may be repaired automatically. Do not solve timing failures by creating a second canonical timeline/state source.

## PASS criteria
Audio/subtitle/graphics integration is deterministic, policy-safe and renderer-consistent.

## Next
PASS -> TEST-11.