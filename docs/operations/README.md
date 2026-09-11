# Operations

Controlled production operations for the unified `video-production-framework` live here.

Start with:

- `PILOT_OPERATOR_CHECKLIST.md`
- `PILOT_RUNBOOK_SHORTFORM.md`
- `PILOT_RUNBOOK_LONGFORM.md`
- `REAL_PROJECT_01_RUNBOOK.md`
- `FAILURE_RETURN_MAP.md`

Before any real-provider spend, run:

```powershell
npm run check:pilot-readiness
npm run vpf -- env check --format <shortform|longform>
```

After project creation, run:

```powershell
npm run vpf -- project doctor <project_id>
npm run vpf -- pilot preflight <project_id>
```

MIG-13 readiness means the operational controls and runbooks are ready. Final migration-program acceptance still requires a real SHORTFORM pilot PASS, a real LONGFORM pilot PASS, and REAL PROJECT 01 reaching WF-18.
