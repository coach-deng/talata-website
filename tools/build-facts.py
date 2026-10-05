#!/usr/bin/env python3
"""
One source of truth for times, prices and halls (Website v3, 2 Oct 2026).

WHY THIS EXISTS
On 2 Oct 2026 the same training times were typed by hand into about twelve pages,
llms.txt, the homepage JSON-LD and the Worker's trial email, and they disagreed:
the email told new Men 18:30 and sent new U13/U15 families to slots that ended
on 5 Oct. Deng: "one source for everything".

WHAT IT DOES
Reads the vault, the only place a time or a price is decided:
  - Talata/programs.md through .vault-tools/gate/make-facts.py compile_canon(),
    the same parser and the same self-contradiction checks the Worker's
    facts.generated.ts is built with. No second parser.
  - Talata/_references/training-week.md through talata-automations
    dash_collect.parse_training(), the parser the dash week strip uses. The Off
    column (single dates with no session) is read here, it is the one cell
    parse_training ignores.
and writes:
  - data/facts.json                          what tools/apply-facts.py fills pages from
  - Talata-API/src/site-facts.generated.ts   what the trial email reads

    python3 tools/build-facts.py            build both
    python3 tools/build-facts.py --check    exit 1 when either is stale
    python3 tools/build-facts.py --today 2026-10-05

It refuses to write when canon contradicts itself, when a training row names a
hall that is not under Locations, or when a "Who" cell is not a team it knows.
CI never runs this (no vault there); it re-renders from the committed facts.json.
"""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VAULT = Path("/Users/dengawak/Documents/SecondBrain")
TRAINING = VAULT / "Talata/_references/training-week.md"
MAKE_FACTS = VAULT / ".vault-tools/gate/make-facts.py"
DASH_COLLECT = Path("/Users/dengawak/talata-automations/scripts/dash_collect.py")
OUT_JSON = ROOT / "data/facts.json"
OUT_TS = Path("/Users/dengawak/Created Apps/Talata/Talata-API/src/site-facts.generated.ts")

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# A "Who" token in training-week.md -> the team keys it feeds. A row can feed
# several teams ("U17 + U19 + Men"). A token not here stops the build, so a new
# group cannot reach the site under a name nothing renders.
WHO_MAP = {
    "sparks": ["sparks"],
    "mini": ["mini"],
    "junior": ["junior"],
    # 5 Oct 2026: the vault's Holdsport week trains U13 with Junior at Strandvejsskolen ("Junior + U13").
    # On the site that is the Junior session, so u13 alone maps to junior. "u13 academy" stays the Academy row.
    "u13": ["junior"],
    "u13 academy": ["academy_u13_u15"],
    "u15": ["academy_u13_u15", "academy_u15_u17"],
    # academy_u17 / academy_u19 (5 Oct 2026): the trial email offers U17 and U19 different sessions
    # (Deng: U17 Wed or Fri, U19 Mon or Fri 18:45), so each needs a team of its own.
    "u17": ["academy_u15_u17", "academy_u17_u19", "academy_u17"],
    "u19": ["academy_u17_u19", "academy_u19"],
    "men": ["men"],
    "girls 15+ (stevnsgade)": ["girls_15"],
    "open gym": ["open_gym"],
    # 5 Oct 2026 (Deng): Saturday Family Time at Kulturhuset, kids and parents together.
    "family time": ["family_time"],
}

TEAMS = {
    "sparks": "Talata Sparks",
    "mini": "Talata Mini",
    "junior": "Talata Junior",
    "academy_u13_u15": "Academy U13 + U15",
    "academy_u15_u17": "Academy U15 + U17",
    "academy_u17_u19": "Academy U17 + U19",
    "academy_u17": "Academy U17",
    "academy_u19": "Academy U19",
    "girls_15": "Girls 15 and up (Stevnsgade)",
    "men": "Talata Men",
    "open_gym": "Open gym",
    "family_time": "Family Time",
}


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, str(path))
    mod = importlib.util.module_from_spec(spec)
    argv, sys.argv = sys.argv, [str(path)]
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.argv = argv
    return mod


def slug(s):
    t = s.lower()
    for a, b in (("ø", "o"), ("æ", "ae"), ("å", "a"), ("é", "e")):
        t = t.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "_", t).strip("_")


def off_dates():
    """{(day, from, who): [dates]} from the Off column. parse_training ignores it."""
    out, header = {}, None
    for line in TRAINING.read_text(encoding="utf-8").splitlines():
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if all(set(c) <= set("-: ") for c in cells):
            continue
        if header is None:
            header = [c.lower() for c in cells]
            continue
        row = dict(zip(header, cells))
        dates = re.findall(r"\d{4}-\d{2}-\d{2}", row.get("off", ""))
        if dates:
            out[(row.get("day", "")[:3].lower(), row.get("from", ""), row.get("who", ""))] = sorted(dates)
    return out


def team_keys(who):
    keys = []
    whole = who.strip().lower()
    toks = [whole] if whole in WHO_MAP else [t.strip().lower() for t in re.split(r"\s\+\s", who)]
    for tok in toks:
        if tok not in WHO_MAP:
            raise SystemExit("REFUSING: training-week.md names %r (in %r), which is not a team the site "
                             "knows. Add it to WHO_MAP in tools/build-facts.py first." % (tok, who))
        for k in WHO_MAP[tok]:
            if k not in keys:
                keys.append(k)
    return keys


def price_now(camp, today):
    """The price a family pays if they book today: early bird until its date, then standard."""
    until = camp.get("price_early_until")
    if camp.get("price_early") and until and today <= dt.date.fromisoformat(until):
        return camp["price_early"]
    return camp.get("price_standard")


def build(today):
    mf = load(MAKE_FACTS, "makefacts")
    data, bad = mf.compile_canon(today)
    if bad:
        print("REFUSING: programs.md disagrees with itself:", file=sys.stderr)
        for b in bad:
            print("  -", b, file=sys.stderr)
        raise SystemExit(2)
    data.pop("_counts", None)
    raw = data["facts"]

    facts, until = {}, {}
    for k, v in raw.items():
        if k.startswith("rail."):
            continue  # payment numbers never go on the site
        facts[k] = v["v"]
        if v.get("until"):
            until[k] = v["until"]

    venues = {}
    for k, v in facts.items():
        m = re.match(r"venue\.([a-z_]+)\.name$", k)
        if m:
            venues[v] = {"key": m.group(1), "name": v, "address": facts.get("venue.%s.address" % m.group(1))}

    camps = {}
    for key in ("starter", "academy", "pathway"):
        c = {f: facts[k] for k in facts for f in [k.split(".", 2)[2]] if k.startswith("camp.%s." % key)}
        if not c:
            continue
        if "camp.%s.price_early" % key in until:
            c["price_early_until"] = until["camp.%s.price_early" % key]
        c["price_now"] = price_now(c, today)
        camps[key] = c

    dc = load(DASH_COLLECT, "dashcollect")
    rows = dc.parse_training(dc.Paths(training=str(TRAINING)), today)["data"]["rows"]
    off = off_dates()
    training, teams = [], {k: {"label": v, "sessions": []} for k, v in TEAMS.items()}
    for r in rows:
        if r["hall"] not in venues:
            raise SystemExit("REFUSING: training-week.md hall %r is not under Locations in programs.md. "
                             "Add it there so a family can be told the address." % r["hall"])
        keys = team_keys(r["who"])
        row = {
            "day": r["day"], "day_name": DAYS[r["day"]], "start": r["start"], "end": r["end"],
            "who": r["who"], "teams": keys, "hall": r["hall"], "address": venues[r["hall"]]["address"],
            "starts": r["starts"], "ends": r["ends"],
            "off": off.get((DAYS[r["day"]][:3].lower(), r["start"], r["who"]), []),
        }
        training.append(row)
        for k in keys:
            teams[k]["sessions"].append({x: row[x] for x in
                                         ("day", "day_name", "start", "end", "hall", "address", "starts", "ends", "off")})

    body = {
        "sources": {
            "programs_sha": data["canon"]["sha256"],
            "training_sha": hashlib.sha256(TRAINING.read_bytes()).hexdigest(),
            "training_updated": dc.parse_frontmatter(TRAINING.read_text(encoding="utf-8")).get("updated"),
        },
        "facts": facts,
        "camps": camps,
        "teams": teams,
        "training": training,
        "venues": {v["key"]: {"name": v["name"], "address": v["address"]} for v in venues.values()},
    }
    # The sha covers the content only, so a rebuild on another day with nothing
    # changed is not "stale". price_now is content: it changes on the deadline.
    sha = hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return dict(body, sha=sha, built_for=today.isoformat())


TS = """// GENERATED FILE. Do not edit. Talata-Website/tools/build-facts.py, %(built)s.
// The same data as talatabasketball.dk/data/facts.json: training sessions per team
// (from the vault's training-week.md) and canon facts (from programs.md). The trial
// email reads its sessions from here, so the site and the email cannot disagree.
export const SITE_FACTS_SHA = %(sha)s;
export const SITE_FACTS_BUILT = %(built_json)s;
export const SITE_FACTS = %(body)s as const;
"""


def render(doc):
    js = json.dumps(doc, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    ts = TS % {"built": doc["built_for"], "sha": json.dumps(doc["sha"]),
               "built_json": json.dumps(doc["built_for"]),
               "body": json.dumps({k: doc[k] for k in ("teams", "training", "venues", "camps")},
                                  indent=2, ensure_ascii=False, sort_keys=True)}
    return js, ts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--today")
    a = ap.parse_args()
    today = dt.date.fromisoformat(a.today) if a.today else dt.date.today()
    if not TRAINING.exists() or not MAKE_FACTS.exists():
        print("build-facts: vault not here, nothing to build (CI renders from data/facts.json)")
        return 0
    doc = build(today)
    js, ts = render(doc)
    if a.check:
        stale = []
        if not OUT_JSON.exists() or json.loads(OUT_JSON.read_text(encoding="utf-8")).get("sha") != doc["sha"]:
            stale.append(str(OUT_JSON.relative_to(ROOT)))
        if OUT_TS.parent.exists() and (not OUT_TS.exists() or doc["sha"] not in OUT_TS.read_text(encoding="utf-8")):
            stale.append(str(OUT_TS))
        if stale:
            print("build-facts: STALE, run python3 tools/build-facts.py: " + ", ".join(stale))
            return 1
        print("build-facts: ok %s" % doc["sha"][:12])
        return 0
    OUT_JSON.write_text(js, encoding="utf-8")
    if OUT_TS.parent.exists():
        OUT_TS.write_text(ts, encoding="utf-8")
    print("build-facts: wrote data/facts.json and %s (%d training rows, %d camps, sha %s)"
          % (OUT_TS.name, len(doc["training"]), len(doc["camps"]), doc["sha"][:12]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
