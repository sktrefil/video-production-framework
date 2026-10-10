# D.B. Cooper: move the edit to another PC

This folder contains source clip, image, narration, timing, board, prompt, and review artifacts. Binary media is tracked with Git LFS through the local `.gitattributes` file. The canonical `project.db` and its WAL/SHM files are deliberately excluded by the repository `.gitignore`; do not copy a live database by Git.

## On this PC

Run from `apps/editor` in a VS Code PowerShell terminal:

```powershell
git lfs install
git add -- output/db-cooper-v3
git add -- 'scripts/*db-cooper*' scripts/extract-db-cooper-used-exit.ps1 scripts/check-db-cooper-end-distinct.py skills/longform-shot-chain-packager-ko
git diff --cached --stat
git lfs ls-files
git commit -m "Transfer DB Cooper production media and source for Resolve"
git push origin HEAD
```

Check the staged list before committing. This stages the D.B. Cooper project and related editor scripts/skill; it does not stage unrelated repository changes. The folder contains earlier review and rejected versions as provenance. If the push fails because of the account's Git LFS quota, resolve the quota issue and retry the same push; do not re-add binary media as normal Git blobs.

## On the other PC

Check out the same branch and run:

```powershell
git switch codex/workflow-v13-20261004
git pull
git lfs install
git lfs pull
git lfs ls-files
git lfs fsck
```

Confirm that `output/db-cooper-v3/storyboard-lock-v1/clips`, `assets`, and `canonical-workspace/projects/db_cooper_1971_4m30_v3/03_tts/sections` contain real playable media, not Git LFS pointer text. Open the media in DaVinci Resolve and relink by the new local folder path if necessary.

No DaVinci Resolve `.drp`/`.dra` project export was found in this folder when this guide was written. If an existing Resolve timeline must transfer, export its project in Resolve and add that `.drp` or `.dra` file to this folder before staging. Media alone does not carry the Resolve timeline.
