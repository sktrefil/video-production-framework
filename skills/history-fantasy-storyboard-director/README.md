# history-fantasy-storyboard-director

Custom Codex skill package for history-fantasy long-form production.

## Role
- Main skill = director
- Chrome ChatGPT = image renderer
- Future render-polish skill = finish/cleanliness layer

## Install
Copy this folder into your Codex skills directory, for example:

```text
~/.codex/skills/history-fantasy-storyboard-director/
```

Then restart Codex.

## Smoke test

```bash
python scripts/scaffold_project.py demo --root outputs --title "Demo" --duration "30s" --aspect "16:9"
```

## Important
This skill does not itself guarantee image generation or video generation. It creates directing contracts, prompts, gates, and QC structure.

## Third-party basis
This is an original customized skill package informed by the public MIT-licensed `create-storyboard-skill` workflow by TateZhouSiu. See `THIRD_PARTY_NOTICES.md`.

## v0.3 hardening

This version adds:
- required-field non-empty checks
- enum validation
- shot repetition hard-fail thresholds
- attention/camera-phase/camera-complexity validation
- positive and negative validator fixtures
