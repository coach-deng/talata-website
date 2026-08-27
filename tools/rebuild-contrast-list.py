#!/usr/bin/env python3
"""Rebuild the page list baked into tools/contrast-runner.html.

Run after adding or removing pages:  python3 tools/rebuild-contrast-list.py
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP_PARTS = {"node_modules", "instagram_posts", "tools"}
SKIP_PREFIX = ("Photos", "Basketball", "Talata Website Photos", "posters")

pages = sorted(
    str(p.relative_to(ROOT)).replace("\\", "/")
    for p in ROOT.rglob("*.html")
    if not any(x in p.parts for x in SKIP_PARTS)
    and not p.name.startswith("_")
    and not str(p.relative_to(ROOT)).startswith(SKIP_PREFIX)
)

runner = ROOT / "tools" / "contrast-runner.html"
html = runner.read_text()
new, n = re.subn(r"const PAGES = \[.*?\];", "const PAGES = " + json.dumps(pages) + ";", html, count=1, flags=re.S)
if not n:
    sys.exit("could not find the PAGES array in contrast-runner.html")
runner.write_text(new)
print(f"{len(pages)} pages written into tools/contrast-runner.html")
