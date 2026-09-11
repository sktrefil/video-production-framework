# Google Flow Manual Runtime

This runtime models Google Flow as a first-class `MANUAL_EXTERNAL` provider without browser automation, login automation, cookies, or session state.

Preferred operator commands:

```text
vpf job export <job_id> [--project <project_id>]
vpf job import-result <job_id> <generated.mp4> [--project <project_id>]
```

The lower-level runtime entrypoint provides the same filesystem operation after packages are built:

```text
node runtimes/google-flow/runtime.mjs export <job_id> [project_id]
node runtimes/google-flow/runtime.mjs import-result <job_id> <generated.mp4> [project_id]
```

Export writes an execution-only package to `workspace/projects/<project_id>/jobs/<job_id>/` containing the exact RuntimeJob snapshot, exact prompt, exact verified START image, optional exact verified END image, manifest, and operator instructions.

Import validates that the ProviderJob and target Clip are still current, verifies the exported source/prompt/input hashes, probes the MP4, copies it into the canonical project clip path, records a RuntimeResult, and registers the video as a candidate. The clip remains `QC_PENDING`; WF-12 owns the QC disposition and no imported result is auto-approved.

The canonical provider profile is `GOOGLE_FLOW_MANUAL_EXTERNAL_V1@1.0.0`. Runtime secrets are not required or exported.
