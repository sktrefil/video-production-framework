#!/usr/bin/env python3
import pathlib, re, sys

FORBIDDEN_PATTERNS = [
    r"\bphotorealistic\b",
    r"\bphoto-realistic\b",
    r"\bhyperrealistic\b",
    r"\bhyper-realistic\b",
    r"\bultra-realistic\b",
    r"\blive-action\b",
    r"\bdocumentary reenactment\b",
    r"\brealistic cinematic reconstruction\b",
    r"\blooks like a real photograph\b",
    r"사실적인 영화 재현",
    r"실사형",
    r"포토리얼",
]

NEGATION_MARKERS = [
    "no ", "not ", "non-photoreal", "non realistic", "non-realistic",
    "prohibited", "forbidden", "avoid ", "negative constraint",
    "금지", "아니", "않", "비실사", "사용하지", "하지 않는다",
]

def is_negated(line):
    l=line.lower()
    return any(m in l for m in NEGATION_MARKERS)

def main():
    if len(sys.argv)!=2:
        print("usage: validate_non_realistic_style.py <image-or-prompt-artifact>")
        return 2
    p=pathlib.Path(sys.argv[1])
    if not p.exists():
        print(f"ERROR: not found: {p}")
        return 2
    txt=p.read_text(encoding="utf-8",errors="replace")
    hits=[]
    for no,line in enumerate(txt.splitlines(),1):
        for pat in FORBIDDEN_PATTERNS:
            if re.search(pat,line,re.I) and not is_negated(line):
                hits.append((no,line.strip(),pat))
    if hits:
        print("BLOCKED: NON_REALISTIC_STYLE_LOCK violation")
        for no,line,pat in hits:
            print(f"- line {no}: {line} [{pat}]")
        return 1
    print("PASS: no positive photorealistic/live-action style request")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
