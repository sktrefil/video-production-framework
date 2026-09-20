# LONGFORM Architecture Freeze Verification

> Verification target: `docs/LONGFORM_MULTI_AGENT_PRODUCTION_MASTER_DESIGN.md`  
> Implementation baseline: `eeb4683b43a590b4bae805e1fed9c434acc7a85d`  
> Verification result: **PASS — Architecture Freeze v1.0 approved**  
> CI run: `35508078829`

## Verification method

Each Master Design requirement was checked against three evidence classes:

1. implementation or durable Agent configuration,
2. unit / contract / integration / E2E evidence where automation is appropriate,
3. operational Manager policy for actions that cannot or should not be encoded as a low-level runtime rule.

`cli/vpf/test/architecture-freeze.test.ts` is the executable architecture-conformance guard for core invariants.

## 1:1 Requirement Matrix

| Master section | Requirement | Implementation evidence | Test / verification evidence | Result |
|---|---|---|---|---|
| §2.1 | LONGFORM is 16:9, editor/render 1920×1080, image 1536×864 | `LONGFORM_16X9_V1@1.0.0`, project bootstrap/resource registry, image runtime, editor timeline | project-bootstrap tests, image-runtime tests, unified LONGFORM E2E, architecture-freeze test | PASS |
| §2.2 | GPT image generation is prompt/reference driven; browser is transport only | `AGENTS.md`, `.codex/agents/visual_image.toml`, `wf09-auto.ts` blocks LONGFORM auto-authoring, `chatgpt-browser-adapter.mjs` | WF09 generic/browser adapter tests, architecture-freeze test | PASS |
| §2.3 | `project.db` is canonical state | ProjectBootstrap status reads DB, unified storage repositories, Editor canonical assembly | bootstrap doctor/tests, persistence tests, unified E2E | PASS |
| §2.4 | Workers cannot self-approve final gates | `AGENTS.md`, story/visual agent developer instructions | architecture-freeze test | PASS (Agent policy) |
| §3.1 | Agent1 is Manager / Final Gate | main Codex rules in `AGENTS.md` | architecture-freeze test | PASS |
| §3.2 | Agent2 owns research/script/story/TTS/subtitle | `.codex/agents/story_audio.toml` | architecture-freeze test + TTS/Story tests | PASS |
| §3.3 | Agent3 owns visual/reference/prompt/clip design | `.codex/agents/visual_image.toml` | architecture-freeze test + WF09/clip tests | PASS |
| §3.4 | Agent2/3 production fan-out only after Story Gate | `AGENTS.md`; workers require approved script/Scene provenance | architecture-freeze test, Story/TTS/Scene Asset approval gates | PASS |
| §4 | LONGFORM bootstrap pins 1.5.0 channel and 16:9 format | `DEFAULT_CHANNEL_PROFILE_VERSION=1.5.0`, channel profile 1.5.0 | project-bootstrap/resource-versioning tests | PASS |
| §5 | End-to-end lifecycle from story to publish | Story, Scene Assets, Clip, Media Binding, Editor, Render, Final Output packages | `tests/e2e/unified-project` | PASS |
| §6 | TTS/images require approved current Scene graph | TTS repository queries HUMAN_APPROVED scenes; Scene Asset readiness validates current Scene approvals | TTS tests, Scene Asset tests, E2E | PASS |
| §7.1 | LONGFORM narration = SEGMENTED; no merged final narration | TTS domain/runtime, ElevenLabs runtime segmented branch | TTS runtime tests, E2E, architecture-freeze test | PASS |
| §7.2 | 4,000-char limit; split only at Scene boundary | `buildLongformSections`; oversized Scene rejects to Story stage | TTS generation tests, architecture-freeze test | PASS |
| §7.3 | Section MP3/alignment/manifest output structure | ElevenLabs runtime and TTS runtime bridge | runtime adapter tests, E2E | PASS |
| §7.4 | Section provenance preserved | TTS section plan/result hashes, manifest, request IDs | runtime adapter/subtitle bridge tests, E2E | PASS |
| §7.4 v1 scope | Cross-plan unchanged-section audio reuse is not guaranteed | Master Design and Agent2 policy explicitly define whole-plan currentness for v1 | current TTS plan/revision checks and Editor stale rejection | PASS |
| §8 | Section alignment → subtitles → cumulative global offsets | `subtitle-bridge.ts`, subtitle cue generator | subtitle bridge tests and multi-section E2E | PASS |
| §9 | Multiple TTS placements go to A1; subtitles T1; clip/BGM/SFX A2/A3/A4 | editor timeline type→track routing; canonical assembly | editor tests, storage integration, E2E, architecture-freeze test | PASS |
| §10.1 | GLOBAL_VISUAL roles are semantic, not filename-hardcoded | reference manifest + tiered selector | tiered-selector tests, architecture-freeze test | PASS |
| §10.2 | KNF is generic layout/narrative metadata | KNF manifest/selector and generic beat classifier | WF09/reference tests | PASS |
| §10.3 | Only Manager-approved continuity-critical assets are promoted | `AGENTS.md` + visual agent developer instruction | architecture-freeze test | PASS (Agent policy) |
| §11 | Agent3 prepares complete GPT Prompt + exact reference package | visual agent developer instruction enumerates required package fields | architecture-freeze test; browser adapter transport contract tests | PASS |
| §12 | RETRY / REGENERATE / REDESIGN are distinct | Scene Asset statuses, prompt revision guard, Agent policy v1/v2/v3 limit | Scene Asset/WF09 tests, architecture-freeze test | PASS |
| §13 | Large aspect-ratio mismatch regenerates instead of destructive crop | ChatGPT browser worker ratio guard | browser/image runtime tests, architecture-freeze test | PASS |
| §14.1 | Scene-level image QC | Scene Asset image QC + Agent1 review policy | Scene Asset tests/E2E | PASS |
| §14.2 | Sequence continuity QC | Agent1/Agent3 production instructions require sequence continuity review | architecture-freeze test | PASS (Agent policy) |
| §15 | Agent3 clip/video prompt; actual external generation is MANUAL_EXTERNAL | visual agent config; final-clip provider workflow | Final Clip tests, unified E2E | PASS |
| §16.1 | LONGFORM persistent header OFF; explicit title opening-only ≤3s | canonical editor assembly | editor assembly contract tests, E2E | PASS |
| §16.2 | LONGFORM subtitle preset separate from Shorts | domain visual presets + format-aware editor timeline | editor subtitle-style tests, architecture-freeze test | PASS |
| §17 | Dependency changes cannot silently consume stale TTS/images/clips | Story impact analysis, Scene Asset stale reconciliation, Editor TTS provenance rejection, Render/Publish stale reconciliation | Story/Scene Asset/Editor/Render/Final Output tests | PASS |
| §18 | Revisions/hashes preserve provenance | domain/storage records across Script, Scene, TTS, prompt/media, Clip, Editor, Render | package tests + E2E | PASS |
| §19 | Canonical Editor/Render tracks and delivery contract | editor timeline, final render, format profile | editor/render tests and E2E | PASS |
| §20 | SHORTFORM remains backward compatible | SINGLE narration path, SHORTFORM 9:16 profile/header/subtitle | unified E2E runs SHORTFORM and LONGFORM | PASS |
| §21 | Node 22/24 validate + E2E + pilot-readiness must be Green | GitHub Actions workflow | run `35508078829`: all required jobs PASS | PASS |
| §22 | Pilot preflight blocks on readiness failures | Project doctor/pilot-readiness + Agent1 operational checklist | pilot-readiness job PASS; live credentials/browser still checked at actual Pilot start | PASS (Operational gate) |
| §23 | Architecture changes require design→code→tests→review→new baseline | Master Design + `AGENTS.md` | this verification cycle and architecture-freeze test | PASS |
| §24 | Implementation map points to active modules | Master Design mapping | direct repository inspection | PASS |
| §25 | Final production contract is represented by the implementation | Agent rules + runtime/editor/render paths | full matrix above | PASS |

## CI Evidence

Architecture baseline `eeb4683b43a590b4bae805e1fed9c434acc7a85d` was verified by GitHub Actions run `35508078829`:

- `validate (22)`: PASS
- `validate (24)`: PASS
- `e2e`: PASS
- `pilot-readiness`: PASS

The unified E2E exercises both SHORTFORM and LONGFORM and requires LONGFORM to use multiple segmented narration placements.

## Findings corrected during freeze review

The freeze review found and corrected three classes of drift before approval:

- the generic WF09 test incorrectly rejected a legitimate negative guard phrase about 9:16; the test now blocks actual Roman-specific residue instead,
- architecture conformance checks were added as executable tests,
- the Master Design previously overstated automatic unchanged-section TTS reuse across plan revisions; Architecture v1 now documents the actual whole-plan TTS currentness behavior while preserving segmented files and provenance.

## Freeze Decision

**PASS.**

There are no remaining Master Design requirements classified as FAIL or PARTIAL for Architecture v1.0.

Policy-level requirements are deliberately enforced through Codex developer instructions and architecture conformance tests rather than low-level runtime mutation. Operational Pilot checks that depend on the local workstation, credentials, browser session, or working tree remain runtime preflight checks and are not treated as compile-time guarantees.

Pilot is permitted only when the actual Pilot machine repeats the §22 preflight successfully.
