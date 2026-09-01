#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
One command to run before pushing the Talata site.

WHY THIS EXISTS
Shipping used to be five things you had to remember in the right order, and on
1 Sep 2026 two of them were forgotten in the same day:

  - the asset ?v= was not bumped, so a correct fix sat behind a SEVEN DAY cache
    and Deng's browser rendered the wrong games for hours
  - the link audit was written ad hoc, found five real bugs, and was thrown away

A checklist a human has to remember is not a process. This is the process.

    python3 tools/ship.py            # run every gate, fix what can be fixed
    python3 tools/ship.py --check    # report only, change nothing

Exit code 0 means it is safe to commit and push. Anything else, read the output.
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable or "python3"


def run(label, args, expect_zero=True):
    p = subprocess.run([PY] + args, cwd=ROOT, capture_output=True, text=True)
    out = (p.stdout or "") + (p.stderr or "")
    ok = (p.returncode == 0) if expect_zero else True
    return ok, out.strip(), p.returncode


def newest_export():
    """The fixture half of /games is a MANUAL MVP export. Say so if a newer one
    is sitting in Downloads unused — that is the single most common reason
    somebody says 'the games page is not updating'."""
    dl = os.path.expanduser("~/Downloads")
    files = sorted(glob.glob(os.path.join(dl, "kampe_*.csv")))
    if not files:
        return None, None
    newest = max(files, key=os.path.getmtime)
    used = None
    fx = os.path.join(ROOT, "data", "fixtures.json")
    if os.path.isfile(fx):
        try:
            used = json.load(open(fx)).get("source")
        except Exception:
            pass
    return os.path.basename(newest), used


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, change nothing")
    args = ap.parse_args()

    print("Talata ship check\n" + "=" * 60)
    blocking = []
    warned = []

    # 0. is there a fixture export nobody has built from?
    newest, used = newest_export()
    if newest and used and newest != used:
        warned.append("data/fixtures.json is built from %s but %s is newer.\n"
                      "        Run: python3 tools/build-fixtures.py --check" % (used, newest))
        print("  fixtures     ⚠  newer export available (%s)" % newest)
    else:
        print("  fixtures     ok  (%s)" % (used or "no fixtures.json"))

    # 1. asset cache stamps. The 1 Sep bug.
    if args.check:
        ok, out, code = run("bump", ["tools/bump-assets.py", "--check"], expect_zero=False)
        if code != 0:
            blocking.append("assets changed but the ?v= stamp was not bumped.\n"
                            "        Run: python3 tools/bump-assets.py")
            print("  assets       ✗  stamp needs bumping")
        else:
            print("  assets       ok  stamp current")
    else:
        ok, out, code = run("bump", ["tools/bump-assets.py"])
        bumped = "stamp" in out and "Nothing to do" not in out
        print("  assets       ok  %s" % ("BUMPED, include it in the commit" if bumped else "unchanged"))

    # 2. nav/footer drift
    ok, out, code = run("hdr", ["tools/apply-shared-header.py", "--check"], expect_zero=False)
    m = re.search(r"(\d+) page\(s\) would change", out)
    drift = int(m.group(1)) if m else 0
    if drift:
        pages = [l.split()[0] for l in out.splitlines()
                 if l.strip() and "no change" not in l and ".html" in l]
        warned.append("%d page(s) drift from the generated header: %s\n"
                      "        ⚠ Regenerating reorders talata-dark.css on /reviews and /philosophy.\n"
                      "        Prefer a targeted rewrite over a full regeneration."
                      % (drift, ", ".join(pages[:6])))
        print("  nav drift    ⚠  %d page(s)" % drift)
    else:
        print("  nav drift    ok")

    # 3. voice, contrast, structure
    ok, out, code = run("qa", ["tools/qa-check.py"], expect_zero=False)
    fail = re.search(r"(\d+) problem", out)
    nfail = int(fail.group(1)) if fail else 0
    if nfail:
        blocking.append("qa-check reports %d problem(s). Run: python3 tools/qa-check.py" % nfail)
        print("  qa-check     ✗  %d problem(s)" % nfail)
    else:
        print("  qa-check     ok")

    # 4. links, anchors, orphans, redirect loops, titles
    ok, out, code = run("links", ["tools/link-check.py"], expect_zero=False)
    m = re.search(r"TOTAL blocking: (\d+)", out)
    nlink = int(m.group(1)) if m else 0
    if nlink:
        detail = "\n".join("        " + l.strip() for l in out.splitlines()
                           if l.strip().startswith(("blog/", "camps/", "help/", "philosophy/",
                                                    "reviews/", "(site)"))
                           or re.match(r"^\s{2}\w[\w.-]*\.html", l))[:900]
        blocking.append("link-check reports %d blocking issue(s):\n%s" % (nlink, detail))
        print("  links        ✗  %d blocking" % nlink)
    else:
        print("  links        ok")

    print("=" * 60)
    for w in warned:
        print("\n⚠  " + w)
    for b in blocking:
        print("\n✗  " + b)

    if blocking:
        print("\nNOT ready to push. Fix the ✗ items above.")
        return 1
    print("\nReady to commit and push." + (" Warnings above are yours to judge." if warned else ""))
    print("Cloudflare Pages deploys on push to main.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
