#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Check the LIVE Talata site and the Worker. Silent when everything is fine.

WHY THIS EXISTS
Nothing watched production. On 1 Sep 2026 Deng found the wrong games on /men by
opening the page himself, and the Worker deploy on 31 Aug was only confirmed
because somebody remembered to curl /health. Every one of those is a person
doing a machine's job.

This is read-only. It never changes anything and it never emails anyone.

    python3 tools/health-check.py           # human output
    python3 tools/health-check.py --quiet   # print ONLY if something is wrong

Exit 0 = healthy. Exit 1 = something needs a look.
"""
import argparse
import glob
import json
import os
import re
import sys
import urllib.request

SITE = "https://talatabasketball.dk"
WORKER = "https://talata-api.coach-258.workers.dev"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Pages that must always answer. A 404 here is a broken deploy, not a redirect.
MUST_SERVE = ["/", "/games", "/join", "/mini", "/academy", "/men", "/camps",
              "/shop", "/gallery", "/blog", "/help/age-groups", "/saturday"]


def get(url, timeout=20):
    req = urllib.request.Request(url, headers={
        "User-Agent": "talata-health-check",
        "Cache-Control": "no-cache",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        code = getattr(e, "code", None)
        return (code or 0), ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quiet", action="store_true",
                    help="print nothing unless something is wrong")
    args = ap.parse_args()

    problems, notes, lines = [], [], []

    # 1. do the pages answer
    for path in MUST_SERVE:
        code, _ = get(SITE + path)
        if code != 200:
            problems.append("%s returned %s, expected 200" % (path, code or "no response"))
    lines.append("pages          %d checked" % len(MUST_SERVE))

    # 2. one asset stamp, everywhere. The seven-day-cache bug.
    code, home = get(SITE + "/games")
    stamps = set(re.findall(r"/assets/[a-z0-9-]+\.(?:js|css)\?v=([0-9a-z]+)", home))
    if code == 200:
        if len(stamps) > 1:
            problems.append("live asset stamps DISAGREE: %s. A fix may be sitting "
                            "behind the seven day /assets cache." % ", ".join(sorted(stamps)))
        lines.append("asset stamp    %s" % (", ".join(sorted(stamps)) or "none found"))

    # 3. is the published fixture file the newest export we hold
    code, fx = get(SITE + "/data/fixtures.json")
    if code == 200:
        try:
            d = json.loads(fx)
            live_src, counts = d.get("source"), d.get("counts", {})
            lines.append("fixtures       %s, %s games" % (live_src, counts.get("total", "?")))
            local = sorted(glob.glob(os.path.expanduser("~/Downloads/kampe_*.csv")),
                           key=os.path.getmtime)
            if local:
                newest = os.path.basename(local[-1])
                if live_src and newest != live_src:
                    notes.append("a newer export is on this machine (%s) than the site "
                                 "is built from (%s)" % (newest, live_src))
            if not counts.get("total"):
                problems.append("fixtures.json is live but holds no games")
        except Exception as e:
            problems.append("fixtures.json did not parse: %s" % e)
    else:
        problems.append("/data/fixtures.json returned %s" % (code or "no response"))

    # 4. does /games actually render fixtures, not just load
    code, games = get(SITE + "/games")
    if code == 200 and "data-talata-fixtures" not in games:
        problems.append("/games no longer carries the fixtures mount point")

    # 5. the Worker
    code, health = get(WORKER + "/health")
    if code != 200:
        problems.append("Worker /health returned %s. Signup forms and tickets run "
                        "through it." % (code or "no response"))
    else:
        lines.append("worker         health ok")

    # 6. the ads conversion id, still the one thing blocking the campaign
    code, sj = get(SITE + "/assets/talata-signup.js")
    if code == 200 and re.search(r"ADS_SEND_TO\s*=\s*''", sj):
        notes.append("ADS_SEND_TO is still empty, so any Google Ads spend is bidding blind")

    ok = not problems
    if args.quiet and ok and not notes:
        return 0

    print("Talata live health — %s" % SITE)
    for l in lines:
        print("  " + l)
    if problems:
        print("\n🔴 PROBLEMS (%d)" % len(problems))
        for p in problems:
            print("  - " + p)
    if notes:
        print("\n⚠  notes (%d)" % len(notes))
        for n in notes:
            print("  - " + n)
    if ok and not notes:
        print("\nAll clear.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
