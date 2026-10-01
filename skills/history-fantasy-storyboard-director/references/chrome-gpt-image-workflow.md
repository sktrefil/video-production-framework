# Chrome ChatGPT Image Workflow

Chrome ChatGPT is the renderer, not the director.

## Codex produces
- image job id
- reference roles
- must_preserve
- must_change
- must_not_add
- shot size / angle / height
- camera-support geometry
- composition / depth
- subject/environment state
- camera corridor
- next handoff
- canonical prompt
- negative constraints

## Renderer must not re-decide
- story event
- shot size
- camera direction
- primary subject
- continuity mode
- entry / target / exit
- FACT_LOCK
- Visual Bible locks

After generation, return the image to Codex for QC.
