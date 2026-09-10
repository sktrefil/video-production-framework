# MIG-06 — Standard Image Runtime

Status: **IMPLEMENTED / LOCAL VERIFICATION PASS**

Base: `bb37823` (`migration/mig-05-elevenlabs-runtime`)

Branch: `migration/mig-06-image-runtime`

## Implemented

- Provider-neutral typed ImageRuntimeInput and automated adapter interface.
- Exact prompt/negative-prompt transport, including whitespace, Unicode and line endings.
- Explicit reference identity/path/hash/role, verified file bytes before submission.
- Pinned Format Profile dimension/aspect validation through a MIG-03 resolver adapter.
- PNG probing with CRC/decompression checks, MIME/dimensions/size/SHA-256 metadata.
- No-overwrite atomic output promotion and project-relative/symlink path checks.
- Manual exact job serialization and checksum-verified external-result import.
- MIG-02 RuntimeResult ingestion atomically connected to WF-09 candidate state.
- FAILED -> REGENERATE_REQUIRED and retry payload preservation.
- Correct WF-09 ProviderJob target revision after GENERATING Asset revision creation.
- Runtime-specific legacy decision-stack scan.

## Verification (Node 24.19.0)

- `npm run build`: PASS.
- `npm run typecheck`: PASS.
- `node --import tsx --test packages/*/test/*.test.ts cli/vpf/test/*.test.ts`: **153/153 PASS**.
- `node scripts/check-no-legacy-paths.mjs`: PASS.
- `git diff --check`: PASS.

The standard `npm test` command encountered the host's local IPC socket restriction
in the tsx CLI. The alternate Node/tsx import runner executed the same repository
test files without opening that socket. Missing better-sqlite3 native bindings
were rebuilt with the repository-approved `npm rebuild better-sqlite3`.

## Acceptance scope / explicit limitations

The standard execution boundary is implemented. A commercial provider/model has
not been selected, billed or exercised. The concrete included automated provider
is a mock fixture provider; production integration supplies the adapter. Manual
external image import is implemented, but cannot attest what a human submitted.

Initial result support is non-interlaced, 8-bit grayscale/RGB/gray-alpha/RGBA PNG.
JPEG/WebP/indexed/interlaced PNG are rejected rather than transformed. Canonical
resource files and Visual Bible bytes are unchanged. No style planning, prompt
rewriting, QC decisions, automatic approval or legacy visual imports were added.

Remote CI is not included in the local verification claim above.
