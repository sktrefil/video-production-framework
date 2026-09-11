# TEST-03 — Resource Registry + Canonical Resources

Owner: MIG-03

## Goal
Validate immutable versioned resources, canonical resolution, hash pinning, and exact resource identity used by projects.

## Validate
- registry resolves explicit resource id/version deterministically,
- canonical schemas/profiles/Visual Bible/rule registry/provider profiles validate,
- version + SHA-256 pins are reproducible,
- existing immutable versions keep exact bytes/hash,
- project bootstrap references approved current versions without silent upgrade,
- invalid/missing/hash-mismatched resources fail closed.

## Required regression
Pay special attention to `HISTORY_MYSTERY_V1` version separation and any previously frozen hash invariants.

## Repair rule
Resolver/test defects may be fixed automatically. Mutating bytes of an existing immutable canonical version requires `NEEDS_REVIEW`; create a new version instead when architecture permits.

## PASS criteria
Canonical resources are immutable, pin-stable and correctly resolved.

## Next
PASS -> TEST-04.