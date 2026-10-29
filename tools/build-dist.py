#!/usr/bin/env python3
"""
Copy only the public site into dist/ (Website v3, 2 Oct 2026).

Until 2 Oct the deploy published the whole checkout, so tools/*.py, the CI config,
wrangler.toml and the facts lock were readable at talatabasketball.dk/tools/...
CI now runs this after tools/apply-facts.py and deploys dist/.

It copies every file git tracks, as it is in the working tree (so the facts the
nightly run filled in are what ships), except:
  - folders: tools/, .github/, .claude/, dist/
  - files:   wrangler.toml, .gitignore, and any *.py, *.md, *.lock, *.mjs
Raw photo dumps are git-ignored and never tracked, so they never reach dist/.

What ships is also cleaned (29 Oct 2026). data/*.json is public at /data/..., and it
carried working notes: the file-level "note" (paths into the vault) and every "why",
one of which said a held-back cup score stays off the site. So in dist/:
  - data/*.json loses its top-level "note", every "why", and results.json loses
    the held games (hold: true) outright. Game and stock notes the pages show stay.
  - llms.txt loses the <!--fact:...--> markers that apply-facts.py fills between.

    python3 tools/build-dist.py            build dist/
    python3 tools/build-dist.py --list     print what would ship, build nothing
"""
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
SKIP_DIRS = ("tools/", ".github/", ".claude/", "dist/", "posters/")  # posters/: print art, not pages
SKIP_FILES = {"wrangler.toml", ".gitignore"}
SKIP_EXT = (".py", ".md", ".lock", ".mjs")


def tracked():
    out = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True).stdout
    return [p for p in out.decode("utf-8").split("\0") if p]


def public(rel):
    if rel.startswith(SKIP_DIRS) or rel in SKIP_FILES or rel.endswith(SKIP_EXT):
        return False
    return os.path.isfile(os.path.join(ROOT, rel))


def clean_json(rel, text):
    """Strip working notes from a data file before it goes public."""
    doc = json.loads(text)

    def drop_why(o):
        if isinstance(o, dict):
            return {k: drop_why(v) for k, v in o.items() if k != "why"}
        if isinstance(o, list):
            return [drop_why(v) for v in o]
        return o

    if isinstance(doc, dict):
        doc.pop("note", None)
        if rel == "data/results.json":
            doc = {k: v for k, v in doc.items() if not (isinstance(v, dict) and v.get("hold"))}
    return json.dumps(drop_why(doc), ensure_ascii=False, indent=2) + "\n"


FACT_MARK = re.compile(r"<!--/?fact[^>]*-->")


def main(argv):
    files = [p for p in tracked() if public(p)]
    if "--list" in argv:
        print("\n".join(files))
        print("build-dist: %d files would ship" % len(files), file=sys.stderr)
        return 0
    must = ("index.html", "_headers", "_redirects", "data/facts.json", "data/fixtures.json", "assets/talata-nav.js")
    missing = [m for m in must if m not in files]
    if missing:
        print("build-dist: REFUSING, these must ship and are not tracked: %s" % ", ".join(missing))
        return 1
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    for rel in files:
        dst = os.path.join(DIST, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        src = os.path.join(ROOT, rel)
        if rel.startswith("data/") and rel.endswith(".json"):
            with open(src, encoding="utf-8") as f:
                out = clean_json(rel, f.read())
        elif rel == "llms.txt":
            with open(src, encoding="utf-8") as f:
                out = FACT_MARK.sub("", f.read())
        else:
            shutil.copy2(src, dst)
            continue
        with open(dst, "w", encoding="utf-8") as f:
            f.write(out)
    print("build-dist: %d files in dist/" % len(files))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
