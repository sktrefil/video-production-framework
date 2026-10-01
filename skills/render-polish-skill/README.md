# render-polish-skill

Companion Codex skill for the `history-fantasy-storyboard-director` package.

## Role
The director skill locks story/camera/continuity. This skill improves render cleanliness and readability without changing those locks.

## Install
Copy the folder into your Codex skills directory, for example:

```text
~/.codex/skills/render-polish-skill/
```

Restart Codex after installation.

## Validators

```bash
python scripts/validate_polish_contract.py examples/positive/standard_pass.json
python scripts/validate_locked_fields.py examples/positive/standard_pass.json
python scripts/validate_prompt_budget.py examples/positive/standard_pass.json
python scripts/validate_continuity_color.py examples/positive/standard_pass.json
```

Negative fixtures are in `examples/negative/`.
