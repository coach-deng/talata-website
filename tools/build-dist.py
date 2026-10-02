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

    python3 tools/build-dist.py            build dist/
    python3 tools/build-dist.py --list     print what would ship, build nothing
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
SKIP_DIRS = ("tools/", ".github/", ".claude/", "dist/")
SKIP_FILES = {"wrangler.toml", ".gitignore"}
SKIP_EXT = (".py", ".md", ".lock", ".mjs")


def tracked():
    out = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True).stdout
    return [p for p in out.decode("utf-8").split("\0") if p]


def public(rel):
    if rel.startswith(SKIP_DIRS) or rel in SKIP_FILES or rel.endswith(SKIP_EXT):
        return False
    return os.path.isfile(os.path.join(ROOT, rel))


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
        shutil.copy2(os.path.join(ROOT, rel), dst)
    print("build-dist: %d files in dist/" % len(files))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
