# D.B. Cooper v3 — VS Code production runbook

Run these in `apps/editor`. This is a draft prompt package; image/video generation and production gates still require review.

PRODUCTION HOLD: `review/full-tts-timing-review-v3.md` measured 162.544s of 1.1x preview narration against the 270s plan. CL01 END and CL29 START-reference revisions are also unresolved. Do not produce from this v1 runbook until script/scene timing, the shot plan, and gates are revised.

```powershell
node scripts/db-cooper-chain.mjs prepare
node scripts/db-cooper-chain.mjs status
```

For each shot, generate the START still when a START prompt exists, then the END/TARGET still when its prompt exists, then submit the VIDEO prompt with its listed assets. Save each returned video as `clips/CLxx.mp4` under this package. After a clip is accepted, one reusable command scans all available clips, extracts actual used exits, and binds dependent starts:

```powershell
powershell -NoProfile -File scripts/db-cooper-sync.ps1
node scripts/db-cooper-chain.mjs status
```

Extraction is evidence only: `EXTRACTED_UNREVIEWED` never approves a clip or its successor. For a STORY_CUT, use its independent START prompt. For `EXIT_REFERENCE`, reuse the named earlier actual exit after QC.

| Clip | Timeline | START | END/TARGET | VIDEO prompt |
| --- | --- | --- | --- | --- |
| CL01 | 0–10s (10s used / 10s source) | prompts/CL01_START.prompt.txt | prompts/CL01_END.prompt.txt | prompts/CL01_VIDEO.prompt.txt |
| CL02 | 10–18s (8s used / 10s source) | prompts/CL02_START.prompt.txt | none | prompts/CL02_VIDEO.prompt.txt |
| CL03 | 18–27s (9s used / 10s source) | prompts/CL03_START.prompt.txt | prompts/CL03_END.prompt.txt | prompts/CL03_VIDEO.prompt.txt |
| CL04 | 27–36s (9s used / 10s source) | PREVIOUS_USED_EXIT: CL03 | prompts/CL04_END.prompt.txt | prompts/CL04_VIDEO.prompt.txt |
| CL05 | 36–45s (9s used / 10s source) | PREVIOUS_USED_EXIT: CL04 | prompts/CL05_END.prompt.txt | prompts/CL05_VIDEO.prompt.txt |
| CL06 | 45–54s (9s used / 10s source) | PREVIOUS_USED_EXIT: CL05 | prompts/CL06_END.prompt.txt | prompts/CL06_VIDEO.prompt.txt |
| CL07 | 54–62s (8s used / 10s source) | prompts/CL07_START.prompt.txt | prompts/CL07_END.prompt.txt | prompts/CL07_VIDEO.prompt.txt |
| CL08 | 62–72s (10s used / 10s source) | prompts/CL08_START.prompt.txt | prompts/CL08_END.prompt.txt | prompts/CL08_VIDEO.prompt.txt |
| CL09 | 72–82s (10s used / 10s source) | PREVIOUS_USED_EXIT: CL08 | prompts/CL09_END.prompt.txt | prompts/CL09_VIDEO.prompt.txt |
| CL10 | 82–92s (10s used / 10s source) | prompts/CL10_START.prompt.txt | prompts/CL10_END.prompt.txt | prompts/CL10_VIDEO.prompt.txt |
| CL11 | 92–102s (10s used / 10s source) | prompts/CL11_START.prompt.txt | prompts/CL11_END.prompt.txt | prompts/CL11_VIDEO.prompt.txt |
| CL12 | 102–112s (10s used / 10s source) | PREVIOUS_USED_EXIT: CL11 | prompts/CL12_END.prompt.txt | prompts/CL12_VIDEO.prompt.txt |
| CL13 | 112–121s (9s used / 10s source) | PREVIOUS_USED_EXIT: CL12 | prompts/CL13_END.prompt.txt | prompts/CL13_VIDEO.prompt.txt |
| CL14 | 121–130s (9s used / 10s source) | prompts/CL14_START.prompt.txt | none | prompts/CL14_VIDEO.prompt.txt |
| CL15 | 130–139s (9s used / 10s source) | PREVIOUS_USED_EXIT: CL14 | prompts/CL15_END.prompt.txt | prompts/CL15_VIDEO.prompt.txt |
| CL16 | 139–148s (9s used / 10s source) | PREVIOUS_USED_EXIT: CL15 | prompts/CL16_END.prompt.txt | prompts/CL16_VIDEO.prompt.txt |
| CL17 | 148–157s (9s used / 10s source) | PREVIOUS_USED_EXIT: CL16 | prompts/CL17_END.prompt.txt | prompts/CL17_VIDEO.prompt.txt |
| CL18 | 157–166s (9s used / 10s source) | prompts/CL18_START.prompt.txt | prompts/CL18_END.prompt.txt | prompts/CL18_VIDEO.prompt.txt |
| CL19 | 166–175s (9s used / 10s source) | prompts/CL19_START.prompt.txt | prompts/CL19_END.prompt.txt | prompts/CL19_VIDEO.prompt.txt |
| CL20 | 175–185s (10s used / 10s source) | PREVIOUS_USED_EXIT: CL19 | prompts/CL20_END.prompt.txt | prompts/CL20_VIDEO.prompt.txt |
| CL21 | 185–194s (9s used / 10s source) | prompts/CL21_START.prompt.txt | prompts/CL21_END.prompt.txt | prompts/CL21_VIDEO.prompt.txt |
| CL22 | 194–203s (9s used / 10s source) | PREVIOUS_USED_EXIT: CL21 | prompts/CL22_END.prompt.txt | prompts/CL22_VIDEO.prompt.txt |
| CL23 | 203–211s (8s used / 10s source) | prompts/CL23_START.prompt.txt | none | prompts/CL23_VIDEO.prompt.txt |
| CL24 | 211–220s (9s used / 10s source) | prompts/CL24_START.prompt.txt | prompts/CL24_END.prompt.txt | prompts/CL24_VIDEO.prompt.txt |
| CL25 | 220–229s (9s used / 10s source) | PREVIOUS_USED_EXIT: CL24 | prompts/CL25_END.prompt.txt | prompts/CL25_VIDEO.prompt.txt |
| CL26 | 229–238s (9s used / 10s source) | prompts/CL26_START.prompt.txt | prompts/CL26_END.prompt.txt | prompts/CL26_VIDEO.prompt.txt |
| CL27 | 238–246s (8s used / 10s source) | PREVIOUS_USED_EXIT: CL26 | prompts/CL27_END.prompt.txt | prompts/CL27_VIDEO.prompt.txt |
| CL28 | 246–254s (8s used / 10s source) | prompts/CL28_START.prompt.txt | prompts/CL28_END.prompt.txt | prompts/CL28_VIDEO.prompt.txt |
| CL29 | 254–262s (8s used / 10s source) | EARLIER_USED_EXIT: CL01 | none | prompts/CL29_VIDEO.prompt.txt |
| CL30 | 262–270s (8s used / 10s source) | PREVIOUS_USED_EXIT: CL29 | prompts/CL30_END.prompt.txt | prompts/CL30_VIDEO.prompt.txt |
