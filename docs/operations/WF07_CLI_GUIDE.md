# WF-07 Production CLI Guide

This guide is the operator entrypoint for research, fact approval, FINAL script approval, and story graph materialization in the unified `video-production-framework`.

`project.db` remains the canonical authority. Files under `01_research/` and `02_script/` are operator/exchange inputs only; the CLI validates and persists accepted state into the same project database.

## 0. Prerequisite

The project must already exist and pass the unified project doctor.

```powershell
npm run vpf -- project status pilot_short_01
npm run vpf -- project doctor pilot_short_01
```

Use the `projectRoot` reported by project creation/status when preparing input files.

## 1. Add a research source

```powershell
npm run vpf -- research add pilot_short_01 `
  --title "Source title" `
  --type WEB `
  --url "https://example.com/source" `
  --citation "Optional citation" `
  --notes "Optional operator notes"
```

Supported source types:

```text
WEB
BOOK
PAPER
ARCHIVE
USER_FILE
OTHER
```

The command returns the durable source ID, for example `src_...`. Record that ID for FACT records.

## 2. Add and approve facts

A `FACT` requires at least one supporting source ID.

```powershell
npm run vpf -- fact add pilot_short_01 `
  --classification FACT `
  --statement "A factual statement used by the script." `
  --source src_xxx
```

Multiple source IDs may be supplied by repeating `--source`.

```powershell
npm run vpf -- fact add pilot_short_01 `
  --classification FACT `
  --statement "A factual statement supported by multiple sources." `
  --source src_xxx `
  --source src_yyy
```

Supported classifications:

```text
FACT
PLAUSIBLE
INTERPRETATION
```

Approve the returned `fact_...` ID:

```powershell
npm run vpf -- fact approve pilot_short_01 fact_xxx
```

Only current `APPROVED` facts are supplied to story generation.

## 3. Prepare the script file

Create/edit files inside the project workspace, normally:

```text
workspace/projects/pilot_short_01/02_script/draft.txt
workspace/projects/pilot_short_01/02_script/final.txt
```

WF-07 deliberately refuses `--file` or `--plan` paths outside the current project workspace, including symlinks that resolve outside it.

Create a DRAFT script:

```powershell
npm run vpf -- script create pilot_short_01 `
  --file .\workspace\projects\pilot_short_01\02_script\draft.txt
```

The command returns a stable `script_...` ID.

## 4. Revise the same script to FINAL

```powershell
npm run vpf -- script revise pilot_short_01 script_xxx `
  --file .\workspace\projects\pilot_short_01\02_script\final.txt `
  --kind FINAL
```

Revisions preserve the same script ID and increment the revision. Previous revisions remain historical records rather than being overwritten.

A DRAFT script cannot receive FINAL approval.

## 5. Human-approve the FINAL script

```powershell
npm run vpf -- script approve pilot_short_01 script_xxx `
  --approved-by operator
```

Story generation is blocked until the current FINAL script revision has a durable `HUMAN_APPROVED` approval record.

If a later FINAL script revision is approved, existing story structure is marked stale according to the accepted WF-07 impact rules; history is not deleted.

## 6. Prepare `story-plan.json`

The CLI does not secretly call an AI provider. An operator or an external authoring assistant may prepare the plan, but the existing `StoryGenerationService` validates it before anything is committed.

Recommended location:

```text
workspace/projects/pilot_short_01/02_script/story-plan.json
```

Minimal example:

```json
{
  "structure": {
    "chapters": [
      {
        "key": "ch1",
        "displayNumber": 1,
        "title": "Hook"
      }
    ]
  },
  "sequences": {
    "sequences": [
      {
        "key": "seq1",
        "chapterKey": "ch1",
        "displayNumber": 1,
        "title": "Opening mystery",
        "storyPurpose": "HOOK"
      }
    ]
  },
  "scenes": {
    "scenes": [
      {
        "key": "sc1",
        "sequenceKey": "seq1",
        "displayNumber": 1,
        "scriptSegment": "The first sentence from the approved FINAL script.",
        "stateIn": "Initial visible state",
        "stateCurrent": "Visible state during this scene",
        "stateOut": "Visible state handed to the next scene",
        "primaryVisualIdea": "Primary visual concept",
        "mustBeSeen": ["required visible element"],
        "canBeNarrated": [],
        "canBeImplied": [],
        "requiredIdentityAnchorIds": []
      }
    ]
  }
}
```

### Required story-plan rules

- Chapter `displayNumber` values start at 1 and are contiguous.
- Every chapter contains at least one sequence.
- Sequence order is contiguous within each chapter.
- Every sequence contains at least one scene.
- Scene order is contiguous within each sequence.
- Every Scene has non-empty `stateIn`, `stateCurrent`, and `stateOut`.
- Every `scriptSegment` must exist **verbatim** in the approved FINAL script.
- Scene script segments must preserve their order in the FINAL script.
- The CLI does not silently rewrite the approved script to make a plan pass.

## 7. Generate the durable story graph

```powershell
npm run vpf -- story generate pilot_short_01 `
  --plan .\workspace\projects\pilot_short_01\02_script\story-plan.json
```

On success the same `project.db` contains Chapters, Sequences, Scenes, source-script references, workflow events and durable history.

Inspect the current WF-07 state:

```powershell
npm run vpf -- story status pilot_short_01
```

## 8. Human-approve structure and scenes

Approve the current structure:

```powershell
npm run vpf -- story approve-structure pilot_short_01 `
  --approved-by operator
```

Approve every current scene:

```powershell
npm run vpf -- story approve-scenes pilot_short_01 `
  --all `
  --approved-by operator
```

Or approve selected scenes only:

```powershell
npm run vpf -- story approve-scenes pilot_short_01 `
  --scene sc_xxx `
  --scene sc_yyy `
  --approved-by operator
```

Use either `--all` or one/more `--scene` values, not both.

## 9. WF-07 closeout

Before advancing to WF-08, run:

```powershell
npm run vpf -- story status pilot_short_01
npm run vpf -- project doctor pilot_short_01
```

WF-07 is ready for WF-08 only when:

```text
current FINAL script       HUMAN_APPROVED
story structure            generated + HUMAN_APPROVED
required Scenes            APPROVED
project.db                 healthy/current
legacy execution path      not used
```

The next owning stage is WF-08 Visual Identity: canonical Visual Bible → Project Style → Identity Anchors.
