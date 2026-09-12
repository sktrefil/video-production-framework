# PILOT-VDG-01 — Roman IX Visual Direction Grammar V1 Real WF-09 AUTO Image Generation Validation

## Goal

Validate the real Roman IX image-generation path against the approved `Visual Direction Grammar V1` without immediately spending generation capacity on all eleven cuts.

The validation is intentionally staged:

1. migrate/pin/compile all eleven Roman IX Scene Assets without provider execution,
2. generate only `cut_001` through the logged-in ChatGPT Browser adapter,
3. verify the exact DB → ProviderJob prompt transport and generated MediaArtifact integrity,
4. stop for human visual review,
5. only after explicit operator confirmation, generate the remaining cuts.

## Canonical resource target

- `HISTORY_MYSTERY_V1@1.3.0`
- `HISTORY_MYSTERY_VISUAL_BIBLE@1.1.0`
- `HISTORY_MYSTERY_VISUAL_DIRECTION_GRAMMAR_V1@1.0.0`
- `IMAGE_PROVIDER_EXECUTION_V1@1.1.0`

`project.db` remains the canonical project state. Derived JSON/Markdown/image mirrors are review and execution artifacts only.

## Visual contract under validation

The real generated image must be driven by the production-ready WF-09 plan, including:

- story-first hierarchy,
- environment-first medium-wide/wide framing by default,
- small-to-medium subject/object scale unless the Scene explicitly justifies a close view,
- restrained painterly matte surface over historically grounded structure,
- handoff-aware depth and continuity for later image-to-video work,
- SHORTFORM central 60–70% information concentration,
- upper/lower 15–20% lower-detail atmospheric zones for blur/crop tolerance,
- no readable generated historical text,
- no unsupported insignia/heraldry,
- no glossy game-render or spectacle-only composition.

## Safety boundary

The preparation stage may revise existing Roman IX Assets only when they are all current `DESIGNED` Assets and no image ProviderJob exists for the pre-grammar state.

WF-09 AUTO must not silently redesign an Asset that has entered provider/candidate/QC/approval production state.

Generated images are never auto-approved.

### Recovery when pre-VDG ProviderJobs already exist

A real pilot may already contain image ProviderJobs or generated Candidates created before Visual Direction Grammar V1. In that case `asset auto prepare` fails closed instead of silently replacing production state.

Use the explicit reset only when the intent is to regenerate those non-approved images under VDG V1:

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\pilot\run-pilot-vdg-01-roman-ix.ps1 `
  -SkipBuild `
  -ResetPreVdg
```

The reset is auditable and non-destructive to history:

- active pre-VDG image ProviderJobs become `SUPERSEDED`,
- active MediaArtifacts produced by those jobs become `SUPERSEDED`,
- active image QC rows are superseded,
- generated source files are moved into `05_images/archive/pre-vdg-<timestamp>/`,
- runtime execution receipts remain unchanged as immutable execution evidence,
- each affected PRIMARY_SCENE Asset advances to a new `DESIGNED` revision with the same Asset ID and no Candidate/approved media,
- VDG V1 preparation then creates the new design/prompt revision,
- only `cut_001` is generated on that run.

The reset refuses to run if any affected Asset is `APPROVED`, has `approved_media_id`, or has a human approval record selecting media. Approved image history requires an explicit higher-level revision decision and is never cleared by this pilot reset.

Do not manually delete `project.db`, ProviderJob rows, MediaArtifact rows, or generated image files to recover this state.

## Local prerequisites

The pilot project is expected at:

```text
workspace/projects/pilot_short_roman_ix/project.db
```

The logged-in Chrome instance must expose CDP, normally at:

```text
http://127.0.0.1:9222
```

Chrome 136+ should be launched with a dedicated `--user-data-dir` together with `--remote-debugging-port=9222`.

Python must provide Playwright and Pillow.

## Phase A + B — prepare and generate only cut_001

Run from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\pilot\run-pilot-vdg-01-roman-ix.ps1
```

The runner first executes the provider-free preparation gate:

```text
asset auto prepare
  ↓
resource repin
  ↓
ProductionLink handoff derivation
  ↓
Visual Direction Grammar derivation
  ↓
existing DESIGNED Asset migration when safe
  ↓
11 DB IMAGE_PROMPT revisions
  ↓
NO ProviderJob
```

It then executes only the first prepared Asset through WF-09B.

Expected technical PASS evidence for `cut_001`:

- exactly one real ProviderJob completes,
- Provider is `CHATGPT_BROWSER`,
- Provider Profile is `IMAGE_PROVIDER_EXECUTION_V1@1.1.0`,
- DB `image_prompt` equals ProviderJob `payload.prompt` exactly,
- DB negative prompt equals ProviderJob negative prompt exactly,
- Asset reaches `CANDIDATE_AVAILABLE` or a later human/QC state,
- MediaArtifact is `AVAILABLE`,
- MediaArtifact points to the ProviderJob that produced it,
- output file exists,
- output MIME is PNG,
- actual SHA-256 equals MediaArtifact checksum,
- actual pixel dimensions equal MediaArtifact dimensions,
- approval count does not increase automatically.

The runner prints the generated image path and stops.

## Human visual gate

Before continuing, inspect `cut_001` for:

- whether the image advances the story rather than presenting a character/object poster,
- whether environment/spatial context dominates appropriately,
- whether characters and objects remain appropriately scaled,
- whether the painterly/matte surface avoids photographic/game-render appearance,
- whether evidence/factual uncertainty is represented conservatively,
- whether key information remains inside the central SHORTFORM information zone,
- whether the image leaves usable depth/geometry for the next-cut handoff and later I2V.

A technical PASS is not a visual approval.

## Phase C — explicit full-generation continuation

Only after the operator accepts the first real image:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\pilot\run-pilot-vdg-01-roman-ix.ps1 -ContinueAll
```

`-ContinueAll` requires an existing `cut_001` candidate and is the explicit operator confirmation to extend the same production grammar to the remaining DESIGNED cuts.

Expected completion state:

```text
11 / 11 cuts have Candidate Media
0 FAILED image ProviderJobs
0 BLOCKED image ProviderJobs
no automatic increase in image approvals
prompt manifest = 11 entries
cut-named candidate mirrors exist
IMAGE_QC remains separate
human approval remains separate
```

## Result states

`PILOT-VDG-01 CUT_001 TECHNICAL VALIDATION: PASS` means only that the real prompt-to-image transport and artifact integrity are correct for the first cut.

`PILOT-VDG-01 FULL GENERATION: PASS` means all eleven cuts completed the real generation path without provider/runtime integrity failures. It does not mean IMAGE_QC or human approval has passed.
