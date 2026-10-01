# Prompt Budget

Measure polish addition:

`added_ratio = polish_added_chars / base_prompt_chars`

Targets:
- LIGHT <= 0.20
- STANDARD <= 0.35
- STRONG <= 0.40

Warnings:
- duplicate adjectives
- repeated lighting phrases
- repeated material phrases
- camera instruction restatement
- polish text longer than directing text

Prefer concise deltas instead of rewriting the base prompt.
