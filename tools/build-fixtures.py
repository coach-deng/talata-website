#!/usr/bin/env python3
"""
Build data/fixtures.json from the DBBF/MVP fixture export.

WHY THIS EXISTS
---------------
Talata's games live in two systems that disagree with each other:

  1. DBBF / MVP Competition  — the federation record. This is what actually
     decides where a team turns up. Exported by hand as `kampe_YYYY-MM-DD.csv`.
  2. Holdsport               — the club calendar. Holds the friendlies and
     tournaments that DBBF has never heard of, and is the thing players and
     parents actually get notified from.

On 26 Aug 2026 Holdsport had BOTH of the next league games on dates DBBF did
not have (Men's Cup on Fri 4 Sep vs a DBBF date that was still unset, U19 vs
Værløse on Thu 10 Sep vs DBBF's Fri 18 Sep). Deng's call, same day: the website
publishes the DBBF record and nothing else for league games. So:

  * League + cup games        -> this file, from the CSV. DBBF wins, always.
  * Friendlies + tournaments  -> live from Holdsport, added by the Worker.

A game that exists in both is deduplicated on the DBBF game number, which
Holdsport carries in its own event titles, e.g. "... (40099294)".

WHY THE CSV AND NOT AN API
--------------------------
MVP Competition has no public fixture API. It notifies by email, per game.
Those emails are the real change feed and they land in Deng's inbox. So the
flow is: a game moves -> MVP emails -> re-export the CSV -> run this script ->
push. Cloudflare Pages auto-deploys on push to main, so push IS deploy here.
That matters: the Worker does NOT auto-deploy, which is why league fixtures
live in this static file and not in Worker code. The path that changes often
rides the deploy that cannot be forgotten.

USAGE
-----
    python3 tools/build-fixtures.py                  # newest kampe_*.csv in ~/Downloads
    python3 tools/build-fixtures.py path/to/file.csv
    python3 tools/build-fixtures.py --check          # exit 1 if output would change
"""

import csv
import datetime as dt
import glob
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "fixtures.json")
DOWNLOADS = os.path.expanduser("~/Downloads")

CLUB = "Talata Basketball"

# DBBF's `organizerteam` and tournament strings are inconsistent between rows
# (the same U13 entry appears as "U-13 Drenge U13DMØ-2", "SISU 2 - U13 mester
# Drenge 2014" and "2014 Drenge U13DMØ-2 Falcon 3" depending on which club
# entered it). Never key off organizerteam. The tournament name is stable.
TOURNAMENT_TO_TEAM = [
    ("U13 Drenge Mester", "U13"),
    ("U15 Drenge Mester", "U15"),
    ("HU19", "U19"),
    ("HU17", "U17"),
    ("Divisionspokal", "Men"),
    ("3. Division Herrer", "Men"),
]

# Public-facing competition names. The DBBF strings are Danish admin labels and
# the site is English everywhere except SEO meta (standing rule).
TOURNAMENT_LABEL = {
    "3. Division Herrer - Øst": "3. Division East",
    "Divisionspokal - Herrer": "Danish Cup",
    "HU19 1. division Øst": "U19 1st Division East",
    "U15 Drenge Mester Øst - Pulje 2": "U15 Championship East",
    "U13 Drenge Mester Øst - Pulje 2": "U13 Championship East",
}

# Holdsport calls it "Nørre Fælled Hallen", DBBF calls it "Nørre Fælled Skole",
# the Kommune booking (BKN-265621) calls it "Idrætshal 14.0.021". One place.
VENUE_CANON = {
    "Nørre Fælled Skole": "Nørre Fælled Skole",
    "Nørre Fælled Hallen": "Nørre Fælled Skole",
}

# Our own halls, so the site can say "home court" rather than just "home".
HOME_VENUES = {"Nørre Fælled Skole", "Svanemøllehallen", "Strandvejsskolen"}


def team_for(tournament: str) -> str:
    for needle, team in TOURNAMENT_TO_TEAM:
        if needle in tournament:
            return team
    return "Talata"


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()


def newest_export() -> str:
    files = glob.glob(os.path.join(DOWNLOADS, "kampe_*.csv"))
    if not files:
        sys.exit(
            "No kampe_*.csv in ~/Downloads.\n"
            "Export it from MVP Competition, then run this again."
        )
    # Sort on the date IN THE NAME, not mtime. A re-downloaded old export gets a
    # fresh mtime and would otherwise beat a newer file. The 23 Aug export had
    # 34 rows against the 22 Aug export's 40 because it silently dropped every
    # row with a confirmed time; picking by mtime is how that trap gets sprung.
    def key(p):
        m = re.search(r"kampe_(\d{4}-\d{2}-\d{2})", os.path.basename(p))
        return m.group(1) if m else "0000-00-00"

    return max(files, key=key)


def build(path: str) -> dict:
    with io.open(path, encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh, delimiter=";"))

    if not rows:
        sys.exit(f"{path} has no rows.")

    games, skipped = [], []
    for r in rows:
        home_team = clean(r.get("hometeam"))
        away_team = clean(r.get("awayteam"))
        is_home = home_team.startswith(CLUB)
        is_away = away_team.startswith(CLUB)

        # A row where we are neither side is another club's game that landed in
        # the export. Never publish it.
        if not (is_home or is_away):
            skipped.append(r.get("number"))
            continue

        opponent = away_team if is_home else home_team
        tournament = clean(r.get("tournament"))
        venue = VENUE_CANON.get(clean(r.get("venuename")), clean(r.get("venuename")))
        court = clean(r.get("courtname"))
        time = clean(r.get("time"))
        status = clean(r.get("status"))

        # 'Mangler Tid' means missing TIME, not missing date. The date is already
        # set by the federation. 'Flytning igang' means a move is in progress, so
        # BOTH the date and the time can still change under us.
        if status == "OK" and time:
            state = "confirmed"
        elif status == "Flytning igang":
            state = "moving"
        else:
            state = "tbc"

        games.append(
            {
                "id": clean(r.get("number")),
                "date": clean(r.get("date")),
                "time": time or None,
                "team": team_for(tournament),
                "opponent": opponent,
                "home": is_home,
                "competition": TOURNAMENT_LABEL.get(tournament, tournament),
                "venue": venue or None,
                "court": court or None,
                "homeCourt": bool(venue) and venue in HOME_VENUES,
                "state": state,
                "source": "dbbf",
            }
        )

    games.sort(key=lambda g: (g["date"], g["time"] or "99:99"))

    counts = {}
    for g in games:
        counts[g["state"]] = counts.get(g["state"], 0) + 1

    return {
        "generated": dt.datetime.now(dt.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "source": os.path.basename(path),
        "note": (
            "League and cup fixtures from the DBBF/MVP export. This is the "
            "federation record and it is what the site publishes. Friendlies "
            "and tournaments are added live from Holdsport by talata-api "
            "/fixtures. Where the two disagree, DBBF wins."
        ),
        "counts": {"total": len(games), **counts},
        "games": games,
    }, skipped


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check = "--check" in sys.argv

    path = args[0] if args else newest_export()
    payload, skipped = build(path)
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"

    if check:
        # Compare the DATA, not the file. `generated` is stamped at run time, so
        # a byte comparison would report stale on every single run and the check
        # would be worthless the day it was added.
        if not os.path.exists(OUT):
            print("data/fixtures.json is MISSING. Run: python3 tools/build-fixtures.py")
            sys.exit(1)
        with io.open(OUT, encoding="utf-8") as fh:
            current = json.load(fh)
        if current.get("games") != payload["games"]:
            have = {g["id"]: g for g in current.get("games", [])}
            want = {g["id"]: g for g in payload["games"]}
            print(f"data/fixtures.json is STALE against {os.path.basename(path)}.")
            for gid in sorted(set(have) | set(want)):
                if have.get(gid) != want.get(gid):
                    a, b = have.get(gid), want.get(gid)
                    if not a:
                        print(f"  + {gid} new: {b['date']} {b['team']} vs {b['opponent']}")
                    elif not b:
                        print(f"  - {gid} gone: {a['date']} {a['team']} vs {a['opponent']}")
                    else:
                        print(f"  ~ {gid} {a['date']} {a['time']} -> {b['date']} {b['time']}"
                              f"  [{a['state']} -> {b['state']}]")
            print("Run: python3 tools/build-fixtures.py")
            sys.exit(1)
        print(f"data/fixtures.json matches {os.path.basename(path)}.")
        return

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, "w", encoding="utf-8") as fh:
        fh.write(text)

    c = payload["counts"]
    print(f"Source   {os.path.basename(path)}")
    print(f"Wrote    {os.path.relpath(OUT, ROOT)}")
    print(
        f"Games    {c['total']} "
        f"({c.get('confirmed', 0)} confirmed, "
        f"{c.get('tbc', 0)} time TBC, "
        f"{c.get('moving', 0)} being moved)"
    )
    if skipped:
        print(f"Skipped  {len(skipped)} row(s) with no Talata side: {skipped}")

    tbc = [g for g in payload["games"] if g["state"] != "confirmed"]
    if tbc:
        print("\nStill unset — these render as TBC on the site:")
        for g in tbc:
            where = "home" if g["home"] else "away"
            print(f"  {g['id']}  {g['date']}  {g['team']:<4} {where:<4} "
                  f"vs {g['opponent']:<22} {g['state']}")


if __name__ == "__main__":
    main()
