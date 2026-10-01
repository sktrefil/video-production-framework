# Validator Test Report

## positive full contract
- script: `validate_polish_contract.py`
- fixture: `examples/positive/standard_pass.json`
- expected exit: 0
- actual exit: 0
- result: PASS
```
PASS: render polish contract
```

## positive locked fields
- script: `validate_locked_fields.py`
- fixture: `examples/positive/standard_pass.json`
- expected exit: 0
- actual exit: 0
- result: PASS
```
PASS: locked snapshots are identical
```

## positive prompt budget
- script: `validate_prompt_budget.py`
- fixture: `examples/positive/standard_pass.json`
- expected exit: 0
- actual exit: 0
- result: PASS
```
PASS: prompt budget ratio=0.300 target<=0.35
```

## positive continuity color
- script: `validate_continuity_color.py`
- fixture: `examples/positive/standard_pass.json`
- expected exit: 0
- actual exit: 0
- result: PASS
```
PASS: continuity-safe color and lighting
```

## negative locked_field_changed.json
- script: `validate_polish_contract.py`
- fixture: `examples/negative/locked_field_changed.json`
- expected exit: 1
- actual exit: 1
- result: PASS
```
BLOCKED:
- validate_locked_fields.py: BLOCKED: locked field changes detected
- camera_path: 'FORWARD_RIGHT' -> 'ORBIT_LEFT'
```

## negative prompt_budget_overflow.json
- script: `validate_polish_contract.py`
- fixture: `examples/negative/prompt_budget_overflow.json`
- expected exit: 1
- actual exit: 1
- result: PASS
```
BLOCKED:
- validate_prompt_budget.py: BLOCKED: prompt budget severe overflow ratio=1.000 limit=0.35
```

## negative wrong_continuity_color.json
- script: `validate_polish_contract.py`
- fixture: `examples/negative/wrong_continuity_color.json`
- expected exit: 1
- actual exit: 1
- result: PASS
```
BLOCKED:
- validate_continuity_color.py: BLOCKED: color continuity mode 'FREE' incompatible with EXIT_MATCH; expected STRICT
```

## negative motion_support_broken.json
- script: `validate_polish_contract.py`
- fixture: `examples/negative/motion_support_broken.json`
- expected exit: 1
- actual exit: 1
- result: PASS
```
BLOCKED:
- motion_support.camera_corridor_clear: must be true
```

## negative strong_ineligible.json
- script: `validate_polish_contract.py`
- fixture: `examples/negative/strong_ineligible.json`
- expected exit: 1
- actual exit: 1
- result: PASS
```
BLOCKED:
- STRONG requires P7_motion_support_pass=true
```

## negative missing_prompt_sections.json
- script: `validate_polish_contract.py`
- fixture: `examples/negative/missing_prompt_sections.json`
- expected exit: 1
- actual exit: 1
- result: PASS
```
BLOCKED:
- final_prompt_en missing section: MUST PRESERVE
- final_prompt_en missing section: VISUAL HIERARCHY
- final_prompt_en missing section: LIGHTING
- final_prompt_en missing section: MATERIAL / DEPTH
- final_prompt_en missing section: COLOR
- final_prompt_en missing section: MOTION SUPPORT
- final_prompt_en missing section: RENDER FINISH
- final_prompt_en missing section: NEGATIVE CONSTRAINTS
```

## Summary
- total: 10
- passed: 10
- failed: 0
