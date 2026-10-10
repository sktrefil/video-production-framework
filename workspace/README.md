# runtime workspace

Default local runtime root:

    workspace/projects/<project_id>/

Real project databases and media are ignored by Git.
Reviewed source for `weekday-roman-gods-v1` is tracked; its live `project.db`
remains local. The GitHub handoff includes a separate database snapshot.

## Reviewed GitHub snapshot

`workspace/project-state-snapshots/pilot_short_roman_ix/` holds the reviewed
GitHub handoff snapshot: `project.db`, `project.json`, and a SHA-256 manifest.
`workspace/project-state-snapshots/weekday-roman-gods-v1/` uses the same handoff
for the approved LONGFORM script and scene state.
After checking out that project's source branch on another PC, stop its editor
and restore the approved state with:

```powershell
npm.cmd run project:state -- restore weekday-roman-gods-v1 --confirm-stopped
```
It is **not** a multi-writer database. The owner creates a snapshot only after
stopping every editor/server process, commits it, and pushes it. Receivers pull
the commit, stop their local editor/server, and restore the snapshot; the
restore command backs up their existing local project state first.

```powershell
npm run project:state -- snapshot pilot_short_roman_ix --confirm-stopped
npm run project:state -- restore pilot_short_roman_ix --confirm-stopped
```

For the normal GitHub handoff, use the guarded commands below instead of a
plain `git push` / `git pull`. `publish` creates and commits a checked snapshot
before pushing. `download` fast-forwards from GitHub and restores that snapshot
after first backing up the receiver's local runtime state.

```powershell
npm run project:state -- publish pilot_short_roman_ix --confirm-stopped
npm run project:state -- download pilot_short_roman_ix --confirm-stopped
```

`*.db-wal`, `*.db-shm`, media, and render outputs remain ignored.

Set VPF_WORKSPACE_ROOT to place runtime projects on another disk. Structured
artifact paths remain project-relative regardless of the physical workspace
root.
