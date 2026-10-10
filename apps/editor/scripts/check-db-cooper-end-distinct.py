#!/usr/bin/env python3
"""Reject a generated CL06 END that is the START or a near-identical composition.

Reads the proposed END PNG from stdin; does not write an image or approve its art.
"""

import io
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps, ImageStat


def pearson(left, right):
    a = list(left.getdata())
    b = list(right.getdata())
    mean_a = sum(a) / len(a)
    mean_b = sum(b) / len(b)
    covariance = sum((x - mean_a) * (y - mean_b) for x, y in zip(a, b))
    variance_a = sum((x - mean_a) ** 2 for x in a)
    variance_b = sum((y - mean_b) ** 2 for y in b)
    return covariance / math.sqrt(variance_a * variance_b) if variance_a and variance_b else 1.0


def main():
    start = Image.open(Path(sys.argv[1])).convert("RGB").resize((320, 180))
    proposed = Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGB").resize((320, 180))
    delta = ImageStat.Stat(ImageChops.difference(start, proposed)).mean
    mean_absolute_delta = sum(delta) / 3
    first_edges = ImageOps.grayscale(start).resize((160, 90)).filter(ImageFilter.FIND_EDGES)
    last_edges = ImageOps.grayscale(proposed).resize((160, 90)).filter(ImageFilter.FIND_EDGES)
    edge_correlation = pearson(first_edges, last_edges)
    metrics = {
        "mean_absolute_rgb_delta": round(mean_absolute_delta, 2),
        "edge_correlation": round(edge_correlation, 3),
        "method": "320x180 RGB difference and 160x90 edge correlation",
    }
    if mean_absolute_delta < 14 or (edge_correlation > 0.90 and mean_absolute_delta < 35):
        print(json.dumps(metrics), file=sys.stderr)
        print("Near-identical START/END composition; a new prompt revision is required.", file=sys.stderr)
        return 2
    print(json.dumps(metrics))
    return 0


if __name__ == "__main__":
    sys.exit(main())
