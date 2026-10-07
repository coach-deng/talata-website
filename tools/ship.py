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


def _load_build_fixtures():
    """tools/build-fixtures.py as a module, for its export ordering and CSV
    reading. Importing runs nothing: its main() sits behind __main__, and the
    module level only reads data/results.json."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "build_fixtures", os.path.join(ROOT, "tools", "build-fixtures.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def export_ids(path, bf):
    """Game numbers in one kampe_*.csv, read the way build-fixtures.py reads it."""
    import csv
    import io
    with io.open(path, encoding="utf-8-sig") as fh:
        return {bf.clean(r.get("number")) for r in csv.DictReader(fh, delimiter=";")}


def withdrawn_typed_games(today=None, downloads=None, fixtures=None):
    """Hand-typed upcoming games that an older DBBF export carried and the
    newest one does not. That is how a withdrawal looks.

    WHY (7 Oct 2026): U19 v BK Amager, Fri 9 Oct (40098298), sat in every
    export until 31 Aug, then BK Amager withdrew on 7 Sep and the federation
    dropped the game. A results.json `fixture` entry, typed so the site could
    sell tickets, kept it alive as a phantom home game for a month (fbd6cf0).
    build-fixtures.py adds such a row precisely BECAUSE the export lacks it, so
    it can never notice that the export used to have it. This can.

    Returns [(game, last_export_that_had_it, newest_export)]. A warning, never
    a block: the export can lag a real game, and Deng makes the call."""
    import datetime as dt
    bf = _load_build_fixtures()
    downloads = downloads or bf.DOWNLOADS
    fixtures = fixtures or os.path.join(ROOT, "data", "fixtures.json")
    files = glob.glob(os.path.join(downloads, "kampe_*.csv"))
    if not files or not os.path.isfile(fixtures):
        return []
    if today is None:
        try:
            from zoneinfo import ZoneInfo
            today = dt.datetime.now(ZoneInfo("Europe/Copenhagen")).date().isoformat()
        except Exception:  # noqa: BLE001
            today = dt.date.today().isoformat()
    typed = [g for g in json.load(open(fixtures, encoding="utf-8")).get("games", [])
             if g.get("source") == "results" and (g.get("date") or "") >= today]
    if not typed:
        return []

    # Same order build-fixtures.py uses to pick its newest: the date in the
    # name first, mtime only to break a same-day tie.
    def key(p):
        m = re.search(r"kampe_(\d{4}-\d{2}-\d{2})", os.path.basename(p))
        return (m.group(1) if m else "0000-00-00", os.path.getmtime(p))
    ordered = sorted(files, key=key)
    newest = ordered[-1]
    in_newest = export_ids(newest, bf)
    out = []
    for g in typed:
        if g["id"] in in_newest:
            continue
        had = [p for p in ordered[:-1] if g["id"] in export_ids(p, bf)]
        if had:
            out.append((g, os.path.basename(had[-1]), os.path.basename(newest)))
    return out


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

    # 0a. a hand-typed game the federation has dropped. Read-only.
    try:
        gone = withdrawn_typed_games()
    except Exception as e:  # noqa: BLE001, a broken CSV must not stop a ship
        gone = []
        warned.append("could not compare typed games with the exports (%s)" % type(e).__name__)
    if gone:
        for g, had, newest_csv in gone:
            warned.append("%s %s %s vs %s is typed in data/results.json. %s had it, %s does not.\n"
                          "        That is how a withdrawal looks. Check MVP, then drop the results.json\n"
                          "        fixture and rebuild." % (g["id"], g["date"], g.get("team"),
                                                          g.get("opponent"), had, newest_csv))
        print("  withdrawn    ⚠  %d typed game(s) gone from the newest export" % len(gone))
    else:
        print("  withdrawn    ok  no typed game dropped by DBBF")

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

    # 2a. the TALATA:HEAD block: theme-color, and light mode on pages in
    #     tools/apply-head.py LIGHT_OK (Website v3, 2 Oct 2026). A new page, or
    #     a header regeneration, can leave a page without it. Apply mode
    #     rewrites, --check only reports.
    ok, out, code = run("head", ["tools/apply-head.py", "--check"], expect_zero=False)
    if code != 0:
        if args.check:
            blocking.append("TALATA:HEAD block missing or stale.\n        Run: python3 tools/apply-head.py")
            print("  head         ✗  stale")
        else:
            run("head", ["tools/apply-head.py"], expect_zero=False)
            print("  head         ok  REGENERATED, include it in the commit")
    else:
        print("  head         ok")

    # 2b. generated schema blocks. Both are built from a source of truth
    #     elsewhere (data/fixtures.json, assets/talata-shop.js), so a stale
    #     block means the markup and the page disagree, which is worse for a
    #     crawler than having no markup at all.
    #     The games block goes stale on its own after every game day: a game
    #     that has kicked off drops out of the schema by the clock. So, like the
    #     asset stamp, apply mode regenerates and --check only reports.
    SCHEMA = (("games", "tools/apply-games-schema.py", "games.html"),
              ("shop", "tools/apply-shop-schema.py", "shop.html"))
    if args.check:
        stale = []
        for label, tool, page in SCHEMA:
            ok, out, code = run(label, [tool, "--check"], expect_zero=False)
            if "would update" in out:
                stale.append((label, tool))
        if stale:
            why = ""
            if any(l == "games" for l, _ in stale):
                why = ("\n        (games: usually a game has kicked off since the last run and"
                       " drops off the schema. Expected after a game day.)")
            blocking.append("schema block(s) stale: %s\n        Run: python3 tools/ship.py"
                            " (regenerates them), or %s%s"
                            % (", ".join(l for l, _ in stale),
                               "; ".join("python3 " + t for _, t in stale), why))
            print("  schema       ✗  %s stale" % ", ".join(l for l, _ in stale))
        else:
            print("  schema       ok")
    else:
        regenerated, failed = [], False
        for label, tool, page in SCHEMA:
            ok, out, code = run(label, [tool], expect_zero=False)
            if code != 0:
                blocking.append("%s failed:\n        %s" % (tool, out.replace("\n", "\n        ")))
                print("  schema       ✗  %s generator failed" % label)
                failed = True
            elif " updated" in out:
                regenerated.append(page)
        if regenerated:
            print("  schema       ok  REGENERATED %s, include it in the commit"
                  % ", ".join(regenerated))
        elif not failed:
            print("  schema       ok")

    # 2c. facts: times, prices and halls (Website v3, 2 Oct 2026). One source, the
    #     vault, through tools/build-facts.py into data/facts.json and the Worker's
    #     site-facts.generated.ts, then tools/apply-facts.py into every marker.
    #     Stale facts BLOCK in both modes: a push must carry the regenerated files,
    #     so apply mode regenerates and still stops, and you commit and push again.
    facts_stale = []
    ok, out, code = run("facts", ["tools/build-facts.py", "--check"], expect_zero=False)
    if code != 0:
        facts_stale.append("data/facts.json is behind the vault")
        if not args.check:
            run("facts", ["tools/build-facts.py"], expect_zero=False)
    ok, out, code = run("facts", ["tools/apply-facts.py", "--check"], expect_zero=False)
    if code != 0:
        facts_stale.append("page markers are behind data/facts.json")
        if not args.check:
            run("facts", ["tools/apply-facts.py"], expect_zero=False)
    if facts_stale:
        blocking.append("facts stale: %s.\n        %s" % ("; ".join(facts_stale),
                        "Regenerated now. Commit the changed files and push again." if not args.check
                        else "Run: python3 tools/build-facts.py && python3 tools/apply-facts.py"))
        print("  facts        ✗  %s" % "; ".join(facts_stale))
    else:
        print("  facts        ok")
    ok, out, code = run("orphans", ["tools/apply-facts.py", "--orphans"], expect_zero=False)
    if code != 0:
        blocking.append("a page gained hand-typed times or prices:\n        " + out.replace("\n", "\n        "))
        print("  hand-typed   ✗  more times or prices outside markers")
    else:
        print("  hand-typed   ok  " + out.split("orphans ok, ")[-1])
    # The trial email must run on the same facts. /health reports the sha it was
    # deployed with; a site push ahead of the Worker would show one time on the
    # page and another in the email.
    try:
        import json as _json
        import urllib.request as _u
        site_sha = _json.loads(open(os.path.join(str(ROOT), "data", "facts.json"), encoding="utf-8").read()).get("sha")
        with _u.urlopen(_u.Request("https://talata-api.coach-258.workers.dev/health",
                                  headers={"User-Agent": "talata-ship/1.0"}), timeout=8) as r:
            live = (_json.loads(r.read().decode()).get("gate") or {}).get("site_facts_sha")
        if live == site_sha:
            print("  worker       ok  trial email on the same facts")
        elif os.environ.get("TALATA_WORKER_LAG_OK") == "1":
            warned.append("the Worker runs facts %s, the site %s (TALATA_WORKER_LAG_OK=1)" % (str(live)[:12], str(site_sha)[:12]))
            print("  worker       ⚠  behind, allowed by TALATA_WORKER_LAG_OK")
        else:
            blocking.append("the trial email runs on other facts than the site (Worker %s, site %s).\n"
                            "        Run: cd \"/Users/dengawak/Created Apps/Talata/Talata-API\" && npm run deploy\n"
                            "        (or push anyway with TALATA_WORKER_LAG_OK=1)" % (str(live)[:12], str(site_sha)[:12]))
            print("  worker       ✗  Worker facts behind the site")
    except Exception as e:  # noqa: BLE001, offline is a warning, never a block
        warned.append("could not read the Worker's /health (%s)" % type(e).__name__)
        print("  worker       ⚠  /health not reachable")

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
