# MIG-03 — Resource Registry + Canonical Resources

Status: **WORK ORDER / NOT YET EXECUTED**

## WORK ITEM

`MIG-03`

## GOAL

Turn the Framework's versioned resource ports into real production resources
owned by the unified repository.

## WHY

WF-08/WF-09 already require pinned Channel Visual Bible and Format Profile
resources, but real unified production needs canonical files, hashes, version
resolution and a deliberate replacement for legacy visual-style configuration.

## SOURCE

Target Framework contracts:
- `packages/production-system/src/index.ts`
- `packages/visual-identity/src/index.ts`
- `packages/scene-assets/src/index.ts`
- `packages/domain/src/index.ts`

Old repository is **review input only**, including:
- `production_standard/**`
- `config/media_profiles/**`
- `config/channels/history_mystery.json`
- `config/history_mystery_shorts_style.json`
- `master_library/HISTORY_MYSTERY_STYLIZED_V1/**`

## TARGET

```
packages/resource-registry/
resources/
├─ visual-bibles/
├─ format-profiles/
├─ provider-profiles/
├─ channel-profiles/
└─ schemas/
```

## CLASSIFICATION

```
NEW_BUILD + SELECTIVE ADAPT
```

## DEPENDENCIES

- MIG-01 PASS.
- MIG-02 PASS.

## CRITICAL POLICY

Do **not** copy the old visual guideline/master style/palette wholesale.

The new Channel Visual Bible must be authored as a new canonical resource from
the approved channel-wide visual principles.

Sample MD files are not a style source.

## FILES TO READ FIRST

Target:
- `packages/production-system/src/index.ts`
- `packages/visual-identity/src/index.ts`
- `packages/scene-assets/src/index.ts`
- `docs/WF-08_IMPLEMENTATION.md`
- `docs/WF-09_IMPLEMENTATION.md`

Review-only source:
- `production_standard/VISUAL_WORKFLOW_GUIDE.md`
- `production_standard/policies/visual_object_policy.json`
- `config/media_profiles/formats/LONGFORM.json`
- `config/media_profiles/formats/SHORTS.json`

## IN SCOPE

### Resource registry

Implement:
- ResourceSnapshot,
- resource ID/version/hash,
- schema validation,
- resolver by pinned version,
- hash verification,
- explicit upgrade path,
- missing/stale resource diagnostics.

### Canonical Channel Visual Bible

Create an actual versioned resource for the History/Mystery channel.

Must cover:
- channel-wide visual approach,
- realism/factuality principles,
- character/location/prop continuity principle,
- color/lighting/material language boundaries,
- reconstruction/evidence distinction,
- composition/camera tendencies,
- historical uncertainty handling,
- adaptation rules for different formats,
- avoidances.

Must **not** encode:
- one project's palette,
- Sado Prince-specific look,
- old master-image identity,
- a fixed shorts-only composition.

### Format profiles

Create at least:
- `LONGFORM_16X9_V1`,
- `SHORTFORM_9X16_V1`.

Contain layout/delivery constraints, not visual style.

### Provider profiles

Create initial profiles needed by upcoming work:
- ElevenLabs v3 History,
- Image provider execution profile,
- Google Flow manual-external profile,
- Remotion final render profile when appropriate.

### Channel profile

Define content/channel resource selection without duplicating Visual Bible.

## OUT OF SCOPE

- runtime network calls,
- actual image generation,
- automatic migration of old resource directory,
- old master images as canonical channel anchors.

## PORT ITEMS

None wholesale.

## ADAPT ITEMS

Provider-neutral old rules may be manually extracted only if they remain valid,
for example:
- actual evidence must not be represented as fabricated source,
- source identity/factuality separation,
- safe-area/readability concepts,
- generated reconstruction labeling.

Each adapted rule needs new resource ownership/version/test coverage.

## NEW BUILD ITEMS

- resource registry package,
- schemas,
- canonical Visual Bible,
- canonical format/provider/channel profiles,
- pin/hash tests.

## LEGACY / DO NOT PORT

Explicitly not resolution candidates:
- `history_mystery_shorts_style.json`,
- `HISTORY_MYSTERY_STYLIZED_V1`,
- old scene prompt style presets,
- old master candidate style logic.

## CONTRACTS THAT MUST NOT CHANGE

- WF-08 still materializes Project Style from Visual Bible + approved project
  context.
- WF-09 still compiles image prompt from approved asset context.
- Runtime does not consume Visual Bible directly.
- Existing VersionPins remains project-level pin contract unless a backward-
  compatible extension is necessary.

## IMPLEMENTATION STEPS

1. Define resource schemas and registry API.
2. Implement content hashing.
3. Implement resolver tests using temporary resources.
4. Author LONGFORM and SHORTFORM format profiles.
5. Author initial provider profiles.
6. Author canonical History/Mystery Channel Visual Bible from approved current
   principles, not from old visual master assets.
7. Add resource validation CLI/test helper.
8. Wire WF-08/WF-09 resource ports to registry adapters in integration tests.
9. Add a negative test proving legacy style/master paths cannot resolve.
10. Document resource upgrade/stale-impact process.

## TESTS

- exact version resolution,
- hash mismatch rejection,
- missing version rejection,
- project pin does not auto-upgrade,
- Visual Bible resolves into WF-08,
- Format Profile resolves into WF-09,
- legacy style/master rejected,
- LONGFORM/SHORTFORM share one Visual Bible and differ through format profile,
- provider profile contains no channel style fields.

## ACCEPTANCE CRITERIA

- Real canonical Visual Bible exists: PASS.
- Format profiles exist: PASS.
- Provider profiles exist: PASS.
- Registry version/hash pinning: PASS.
- WF-08/WF-09 integration: PASS.
- Legacy style resources not candidates: PASS.
- Existing regression: PASS.

## ROLLBACK

Return to MIG-02 accepted HEAD. New resource files and registry code are additive;
do not alter old repository resources.

## BRANCH

```
migration/mig-03-resource-registry
```

## NEXT

```
MIG-04 — Project Bootstrap + Unified CLI Foundation
```
