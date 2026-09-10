# vpf unified CLI

MIG-04 establishes the single public control-plane entry point.

Implemented commands:

```text
vpf project create <project_id> --title "..." --format <longform|shortform>
vpf project status <project_id>
vpf project doctor <project_id>
vpf doctor <project_id>
```

Future `run`, `job`, and `qc` command families are reserved by the unified
CLI contract but return `NOT_IMPLEMENTED` until their owning migration adds the
real application service. They never report false execution success.

Project state is read from `workspace/projects/<project_id>/project.db`.
`project.json` is a validated exchange/config snapshot only.
