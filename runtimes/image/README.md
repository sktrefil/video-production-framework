# MIG-06 Image Runtime

This directory is the provider-neutral process entrypoint for unified image generation.

`runtime.mjs` accepts one serialized `RuntimeJob<ImageRuntimeInput>` on stdin. The provider adapter is selected only through `VPF_IMAGE_ADAPTER_MODULE`; provider secrets remain process environment concerns and never enter the durable RuntimeJob payload.

The semantic request is already final before this runtime starts. The runtime may validate, upload references, map transport fields, write the result atomically, probe dimensions/MIME and hash the artifact. It must not append or prepend style language, palette language, master prompts, scene interpretation or other creative policy.

Required process environment for automated execution:

- `VPF_IMAGE_ADAPTER_MODULE`: module exporting `default { generate(request) }` or `createImageProviderAdapter()`.
- `VPF_WORKSPACE_ROOT`: optional unified workspace override; defaults to the repository workspace resolver.
- Provider-specific API keys are read by the adapter itself. They must not be copied into RuntimeJob/RuntimeResult.

Manual providers can use the same typed RuntimeJob and `buildManualImageRuntimeResult()` from `@vpf/provider-orchestrator/image-runtime` after placing the exact result at the approved project-relative output path.
