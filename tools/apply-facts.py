#!/usr/bin/env python3
"""
Fill every time, price and hall on the site from data/facts.json (Website v3,
2 Oct 2026). tools/build-facts.py makes facts.json from the vault; this writes it
into the pages, at build time, so search engines and phones see plain HTML.

MARKERS
  Inline, anywhere in visible HTML:
      <!--fact:camps.academy.price_now|kr-->1.595 kr<!--/fact-->
      <!--fact:teams.mini|sched-->Tue + Thu 15:30 to 16:30 at Strandvejsskolen<!--/fact-->
  The text between the two comments is replaced on every run. A path walks
  facts.json (dots); a key with dots inside it, like facts["program.mini.fee"],
  is written facts.program.mini.fee.

FILTERS
  kr      1595          -> 1.595 kr
  num     1595          -> 1.595
  sched   a team        -> "Tue + Thu 15:30 to 16:30 at Strandvejsskolen, Sat 10:00 to 11:00 at Kulturhuset Indre By"
  priceline a camp      -> "1.295 kr to Sunday 1 November, then 1.495 kr", or "1.495 kr" once it has passed
  range   "16:15-18:00" -> 16:15 to 18:00
  (none)  the value as it is
  No filter ever writes a dash between two numbers (Deng's rule, qa-check fails it).

MODES
    python3 tools/apply-facts.py            write every marker
    python3 tools/apply-facts.py --check    exit 1 if any marker is stale (ship.py runs this)
    python3 tools/apply-facts.py --orphans  count hand-typed times and kr prices OUTSIDE markers,
                                            per page, against tools/facts-orphans.lock; exit 1 if any
                                            page has more than the lock allows (so the count only
                                            falls). --orphans --write records today's counts.
Blog posts are history and are skipped by --orphans: a post from 20 Aug may say
what was true on 20 Aug.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FACTS = ROOT / "data/facts.json"
LOCK = ROOT / "tools/facts-orphans.lock"
SKIP_DIRS = {"tools", "node_modules", ".git", "blog", "dist"}
EXTRA = [ROOT / "llms.txt"]
DAY3 = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

INLINE = re.compile(r"<!--fact:([A-Za-z0-9_.]+)(?:\|([a-z]+))?-->(.*?)<!--/fact-->", re.S)


def pages():
    out = [p for p in ROOT.glob("**/*.html") if not (set(p.relative_to(ROOT).parts) & (SKIP_DIRS - {"blog"}))]
    return sorted(out) + [p for p in EXTRA if p.exists()]


def walk(doc, path):
    node = doc
    parts = path.split(".")
    i = 0
    while i < len(parts):
        if isinstance(node, dict) and parts[i] in node:
            node = node[parts[i]]
            i += 1
            continue
        # a key with dots inside it, e.g. facts["program.mini.fee"]
        if isinstance(node, dict):
            for j in range(len(parts), i, -1):
                k = ".".join(parts[i:j])
                if k in node:
                    node = node[k]
                    i = j
                    break
            else:
                raise KeyError(path)
            continue
        raise KeyError(path)
    return node


def num(v):
    return "{:,}".format(int(v)).replace(",", ".")


def group_sessions(team):
    groups = []
    for s in sorted(team["sessions"], key=lambda s: (s["start"], s["hall"], s["day"])):
        key = (s["start"], s["end"], s["hall"])
        for g in groups:
            if g["key"] == key:
                g["days"].append(s["day"])
                break
        else:
            groups.append({"key": key, "days": [s["day"]]})
    groups.sort(key=lambda g: (min(g["days"]), g["key"][0]))
    return groups


def sched(team):
    parts = []
    for g in group_sessions(team):
        start, end, hall = g["key"]
        days = " + ".join(DAY3[d] for d in sorted(set(g["days"])))
        parts.append("%s %s to %s at %s" % (days, start, end, hall))
    return ", ".join(parts)


def apply_filter(value, filt):
    if filt == "kr":
        return num(value) + " kr"
    if filt == "num":
        return num(value)
    if filt == "sched":
        return sched(value)
    if filt == "priceline":
        # a camp: "1.295 kr to Sunday 1 November, then 1.495 kr" while the early bird
        # runs, then just "1.495 kr". The nightly re-render flips it.
        import datetime as dt
        if value.get("price_now") == value.get("price_early") and value.get("price_early_until"):
            d = dt.date.fromisoformat(value["price_early_until"])
            return "%s kr to %s %d %s, then %s kr" % (num(value["price_early"]), d.strftime("%A"), d.day,
                                                     d.strftime("%B"), num(value["price_standard"]))
        return num(value["price_now"]) + " kr"
    if filt == "range":
        a, b = str(value).split("-")
        return "%s to %s" % (a.strip(), b.strip())
    if filt is None:
        if isinstance(value, (dict, list)):
            raise ValueError("a %s needs a filter" % type(value).__name__)
        return str(value)
    raise ValueError("unknown filter %r" % filt)


def render_text(src, doc, where):
    def sub(m):
        path, filt = m.group(1), m.group(2)
        try:
            value = walk(doc, path)
        except KeyError:
            raise SystemExit("apply-facts: %s names %r, which is not in data/facts.json" % (where, path))
        out = apply_filter(value, filt)
        if re.search(r"\d\s*[-–—]\s*\d", out):
            raise SystemExit("apply-facts: %s %r would print a dash between numbers: %r" % (where, path, out))
        return "<!--fact:%s%s-->%s<!--/fact-->" % (path, "|" + filt if filt else "", out)
    return INLINE.sub(sub, src)


# Hand-typed facts that should live in a marker: a clock time or a kr price.
ORPHAN = re.compile(r"\b\d{1,2}:\d{2}\b|\b\d{1,2}[.,]\d{3}\s*(?:kr|DKK)\b|\b\d{3}\s*kr\b", re.I)


def visible(src):
    s = INLINE.sub("", src)
    s = re.sub(r"<(script|style)\b.*?</\1>", "", s, flags=re.S | re.I)
    s = re.sub(r"<head\b.*?</head>", "", s, flags=re.S | re.I)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    # data-talata-fixtures and similar regions are filled by JS from data files
    return s


def orphan_counts():
    counts = {}
    for p in pages():
        rel = str(p.relative_to(ROOT))
        if rel.startswith("blog/"):
            continue
        n = len(ORPHAN.findall(visible(p.read_text(encoding="utf-8"))))
        if n:
            counts[rel] = n
    return counts


def today_cph():
    import datetime as dt
    try:
        from zoneinfo import ZoneInfo
        return dt.datetime.now(ZoneInfo("Europe/Copenhagen")).date()
    except Exception:  # noqa: BLE001
        return dt.date.today()


def refresh_prices(doc):
    """price_now for today in Copenhagen, so the nightly CI re-render flips an
    early bird at its deadline with no push and no vault (build-facts.py made
    the same choice on the day it ran)."""
    today = today_cph().isoformat()
    for c in (doc.get("camps") or {}).values():
        until = c.get("price_early_until")
        c["price_now"] = c["price_early"] if (c.get("price_early") and until and today <= until) else c.get("price_standard")


def main(argv):
    if not FACTS.exists():
        print("apply-facts: no data/facts.json, run tools/build-facts.py")
        return 1
    doc = json.loads(FACTS.read_text(encoding="utf-8"))
    refresh_prices(doc)
    if "--orphans" in argv:
        counts = orphan_counts()
        if "--write" in argv:
            LOCK.write_text(json.dumps(counts, indent=1, sort_keys=True) + "\n", encoding="utf-8")
            print("apply-facts: recorded %d hand-typed times and prices on %d pages" % (sum(counts.values()), len(counts)))
            return 0
        lock = json.loads(LOCK.read_text(encoding="utf-8")) if LOCK.exists() else {}
        worse = [(p, n, lock.get(p, 0)) for p, n in counts.items() if n > lock.get(p, 0)]
        better = sum(lock.values()) - sum(counts.values())
        if worse:
            for p, n, was in worse:
                print("  %-44s %d hand-typed times/prices, the lock allows %d" % (p, n, was))
            print("apply-facts: a page gained hand-typed times or prices. Put them in a <!--fact:...--> marker.")
            return 1
        print("apply-facts: orphans ok, %d left on %d pages%s"
              % (sum(counts.values()), len(counts), (", %d fewer than the lock" % better) if better > 0 else ""))
        return 0
    check = "--check" in argv
    changed = []
    for p in pages():
        src = p.read_text(encoding="utf-8")
        if "<!--fact:" not in src:
            continue
        out = render_text(src, doc, str(p.relative_to(ROOT)))
        if out != src:
            changed.append(str(p.relative_to(ROOT)))
            if not check:
                p.write_text(out, encoding="utf-8")
    if check and changed:
        print("apply-facts: STALE markers on %s. Run python3 tools/apply-facts.py" % ", ".join(changed))
        return 1
    print("apply-facts: %s %d page(s)" % ("would change" if check else "updated", len(changed)) if changed
          else "apply-facts: every marker current")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
