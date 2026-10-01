# v0.3 Validator Hardening Report

Implemented four requested hardening items:

1. Non-empty required-field validation
2. Enum validation for clip structure / tension / continuity
3. Shot fingerprint hard-fail threshold with explicit override
4. Attention + camera phase + camera complexity validation

## Test Results

### positive storyboard contract
- expected exit: 0
- actual exit: 0
- result: PASS
```
PASS: storyboard contract structure and values
```

### negative empty storyboard contract
- expected exit: 1
- actual exit: 1
- result: PASS
```
BLOCKED:
- duration_target: must contain a positive duration
WARNINGS:
- fact_lock: field not found
- fantasy_allowed: field not found
- invention_prohibited: field not found
```

### positive shot fingerprints
- expected exit: 0
- actual exit: 0
- result: PASS
```
PASS: no problematic shot repetition
```

### negative duplicate fingerprints
- expected exit: 1
- actual exit: 1
- result: PASS
```
BLOCKED:
- shot 1 resembles shot 0: similarity=1.00 (high-similarity repetition without justification)
```

### positive attention/camera
- expected exit: 0
- actual exit: 0
- result: PASS
```
PASS: attention and camera complexity gates
```

### negative attention/camera complexity
- expected exit: 1
- actual exit: 1
- result: PASS
```
BLOCKED:
- 8s+ clip lacks a second attention event around 4-6.5s
- camera_phases too complex: 6 > 5 for 10s clip
- camera complexity limit exceeded: max 1 secondary camera adjustment
- camera move stack is over-complex; use 1 primary move + at most 1 secondary adjustment
```

## Package verdict

All positive fixtures pass and all intended negative fixtures are blocked.

Recommended package score after hardening: **97/100**.

Remaining gap is mostly real-project validation against VPF artifacts and live image/I2V outputs, not core package design.