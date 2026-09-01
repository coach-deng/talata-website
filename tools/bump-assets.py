#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Keep every /assets ?v= stamp in lockstep, automatically.

WHY THIS EXISTS
🔴 1 Sep 2026. The per-team fixture filter shipped correct and nobody received
it. `talata-fixtures.js` changed but kept `?v=20260901a`, and `/assets` is
`max-age=604800` — SEVEN DAYS. Deng's browser ran the old script and rendered a
U15 friendly, a U13 cup tie and a U19 league game under "Talata Men". The origin
was right the whole time. It happened twice in one day, because remembering to
bump 52 pages and 2 generator scripts by hand is not a process, it is a wish.

HOW IT WORKS
Hashes every file in assets/. If the hash differs from the one recorded in
tools/assets.lock, the assets changed and the stamp is bumped everywhere:
all pages, plus apply-shared-header.py and apply-shared-footer.py, so the next
header regeneration does not silently revert it.

    python3 tools/bump-assets.py --check   # says whether a bump is needed
    python3 tools/bump-assets.py           # bump if needed
    python3 tools/bump-assets.py --force   # bump regardless

qa-check.py already FAILS when the stamps disagree. This is the other half:
it stops them disagreeing in the first place.
"""
import argparse
import datetime
import glob
import hashlib
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
LOCK = os.path.join(ROOT, "tools", "assets.lock")
GENERATORS = ["tools/apply-shared-header.py", "tools/apply-shared-footer.py"]
STAMP_RE = re.compile(r"(/assets/[a-z0-9-]+\.(?:js|css))\?v=([0-9a-z]+)")


def page_files():
    pats = ["*.html", "blog/*.html", "camps/*.html", "help/*.html",
            "philosophy/*.html", "reviews/*.html"]
    out = []
    for p in pats:
        out += glob.glob(os.path.join(ROOT, p))
    return sorted(out)


def assets_hash():
    h = hashlib.sha256()
    for f in sorted(glob.glob(os.path.join(ASSETS, "*"))):
        if os.path.isfile(f):
            h.update(os.path.basename(f).encode())
            h.update(open(f, "rb").read())
    return h.hexdigest()


def current_stamps():
    seen = set()
    for f in page_files():
        for _, v in STAMP_RE.findall(io.open(f, encoding="utf-8").read()):
            seen.add(v)
    return seen


def next_stamp(seen):
    """YYYYMMDD + a letter, continuing today's series."""
    today = datetime.date.today().strftime("%Y%m%d")
    used = sorted(s[len(today):] for s in seen if s.startswith(today) and len(s) > len(today))
    if not used:
        return today + "a"
    last = used[-1]
    return today + (chr(ord(last) + 1) if len(last) == 1 and last < "z" else last + "a")


def apply(stamp):
    n = 0
    for f in page_files():
        s = io.open(f, encoding="utf-8").read()
        new = STAMP_RE.sub(lambda m: "%s?v=%s" % (m.group(1), stamp), s)
        if new != s:
            io.open(f, "w", encoding="utf-8").write(new)
            n += 1
    g = 0
    for rel in GENERATORS:
        p = os.path.join(ROOT, rel)
        if not os.path.isfile(p):
            continue
        s = io.open(p, encoding="utf-8").read()
        new = re.sub(r"v=20\d{6}[a-z]?", "v=" + stamp, s)
        if new != s:
            io.open(p, "w", encoding="utf-8").write(new)
            g += 1
    return n, g


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    h = assets_hash()
    lock = {}
    if os.path.isfile(LOCK):
        try:
            lock = json.load(open(LOCK))
        except Exception:
            lock = {}

    seen = current_stamps()
    if len(seen) > 1:
        print("🔴 stamps DISAGREE across pages: %s" % ", ".join(sorted(seen)))
        print("   That is the seven-day-cache bug waiting to happen. Bumping fixes it.")
    changed = args.force or lock.get("hash") != h

    if not changed:
        print("assets unchanged since %s (stamp %s). Nothing to do."
              % (lock.get("bumped", "?"), lock.get("stamp", "?")))
        return 0

    if args.check:
        print("assets CHANGED. Run: python3 tools/bump-assets.py")
        return 1

    stamp = next_stamp(seen)
    n, g = apply(stamp)
    json.dump({"stamp": stamp, "hash": h,
               "bumped": datetime.date.today().isoformat()},
              open(LOCK, "w"), indent=1)
    print("assets changed -> stamp %s" % stamp)
    print("  %d page(s) and %d generator(s) updated" % (n, g))
    print("  recorded in tools/assets.lock")
    return 0


if __name__ == "__main__":
    sys.exit(main())
