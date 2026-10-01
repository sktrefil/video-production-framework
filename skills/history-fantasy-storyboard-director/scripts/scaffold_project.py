#!/usr/bin/env python3
import argparse, pathlib, shutil

FILES = {
"01_brief/project_brief.md": "# Project Brief\n",
"02_bibles/visual_bible.md": "# Visual Bible\n",
"02_bibles/continuity_bible.md": "# Continuity Bible\n",
"03_storyboard/visual_beats.md": "# Visual Beats\n",
"03_storyboard/clip_directing_contracts.md": "# Clip Directing Contracts\n",
"03_storyboard/handoff_matrix.md": "# Handoff Matrix\n",
"04_prompts/image_jobs.md": "# Chrome GPT Image Jobs\n",
"04_prompts/i2v_prompts.md": "# I2V Prompts\n",
"05_qc/qc_log.md": "# QC Log\n",
"06_delivery/manifest.md": "# Manifest\n",
}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--root",default="outputs")
    ap.add_argument("--title",default="")
    ap.add_argument("--duration",default="")
    ap.add_argument("--aspect",default="16:9")
    a=ap.parse_args()
    base=pathlib.Path(a.root)/a.slug
    base.mkdir(parents=True,exist_ok=True)
    for rel, body in FILES.items():
        p=base/rel
        p.parent.mkdir(parents=True,exist_ok=True)
        if rel=="01_brief/project_brief.md":
            body += f"\n- title: {a.title}\n- duration: {a.duration}\n- aspect: {a.aspect}\n"
        p.write_text(body,encoding="utf-8")
    print(base)

if __name__=="__main__":
    main()
