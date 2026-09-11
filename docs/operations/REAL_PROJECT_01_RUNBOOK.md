# REAL PROJECT 01 Runbook

REAL PROJECT 01 begins only after both controlled pilots have passed. It must be a normal new production topic, not the pilot fixture and not a migrated legacy project.

All operator activity must originate from `video-production-framework`.

## Entry criteria

Required before project creation:

- MIG-13 readiness package accepted;
- real SHORTFORM pilot PASS;
- real LONGFORM pilot PASS;
- exact release branch/HEAD recorded;
- CI green;
- clean working tree;
- environment/provider preflight PASS for the intended format;
- adequate workspace storage;
- no unresolved pilot defect classified as a blocking correctness issue.

Run:

```powershell
cd <path-to>\video-production-framework
git status --short
git rev-parse HEAD
npm run vpf -- env check --format <shortform|longform>
```

## Create REAL PROJECT 01

Choose a unique production project ID and a genuinely new topic.

```powershell
npm run vpf -- project create real_project_01 --title "<new topic>" --format <shortform|longform>
npm run vpf -- project status real_project_01
npm run vpf -- project doctor real_project_01
npm run vpf -- pilot preflight real_project_01
```

Do not continue unless project doctor and pilot preflight return PASS/`ready: true` and all resource pins are CURRENT.

## Production progression

Advance through the unified state graph only:

```text
WF-07 FINAL Script / Story approvals
  -> TTS Runtime + human audio QC
  -> WF-08 Project Style / Identity Anchors
  -> WF-09 Image Runtime + IMAGE_QC + approvals
  -> WF-10 Pre-Link / Handoff
  -> WF-11 Final Clip / MANUAL_EXTERNAL Google Flow jobs
  -> validated Google Flow job export / manual generation / result import
  -> WF-12 Clip QC/fallback
  -> WF-13 approved media binding
  -> WF-14~16 editor content/timeline assembly
  -> Generic Editor preview human QC
  -> WF-17 final render / Technical QC / DELIVERY_READY
  -> WF-18 final output QC / package / PUBLISH_HANDOFF_READY
```

At every approval boundary, record the current revision and provenance in `project.db`. Never replace canonical state with hand-edited exchange JSON or the disposable editor public mirror.

## Provider discipline

Automated TTS and image generation use the exact pinned Provider Profiles. Secrets stay in runtime environment only. Google Flow uses the validated `MANUAL_EXTERNAL` runtime backed by `GOOGLE_FLOW_MANUAL_EXTERNAL_V1@1.0.0`.

For each current Flow job:

```powershell
npm run vpf -- job export <job_id> --project real_project_01
# generate manually in Google Flow from the exact exported package
npm run vpf -- job import-result <job_id> <generated.mp4> --project real_project_01
```

The import must map to the current ProviderJob/Clip revision, verify exported source/prompt/input hashes and register only a candidate video. Stale result imports are rejected rather than manually relabeled, and WF-12 remains the QC authority.

## Editor / final output

Materialize only after the current editor assembly is READY:

```powershell
npm run editor:materialize -- real_project_01 --project-root <project-root>
npm run editor:studio
npm run editor:render -- real_project_01 --project-root <project-root>
```

Human preview QC must confirm coverage, audio balance, subtitles/text/graphics and no unintended black frames. WF-17 must produce Technical QC PASS and DELIVERY_READY. WF-18 must produce a current publish package and `publish_handoff.json` READY.

## Completion evidence

REAL PROJECT 01 is complete only when the production log records:

- exact repository HEAD;
- project ID/format/topic;
- all Resource version/hash pins;
- provider request/result IDs as applicable;
- all human approval checkpoints;
- rejected/retry attempts;
- final narration/image/clip hashes;
- final render SHA-256;
- final package SHA-256;
- `WF-18 PUBLISH_HANDOFF_READY`;
- final project doctor PASS;
- final `pilot preflight` ready=true;
- confirmation that no previous production repository was required.

Actual YouTube upload remains outside the migration acceptance scope.

If a blocking defect occurs, use `docs/operations/FAILURE_RETURN_MAP.md` and return to the owning unified stage. Do not fall back to a previous production system for the same project.
