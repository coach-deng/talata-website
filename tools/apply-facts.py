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
                           Standing sessions only (6 Oct 2026): a row whose `ends` has passed is
                           dropped, a one-off row (starts == ends, like Men Fri 9 Oct) never shows,
                           and a row that starts more than a week from today gets "from 19 Oct".
                           The nightly CI re-render drops the "from" once the row is running.
  sat     a team        -> its Saturday sessions only, without the "Sat "
  hall    a venue       -> what trains there, from the training rows, same standing rules as sched:
                           <!--fact:venues.svanemollehallen|hall--> ->
                           "Mon 18:45 to 20:15 U19 + Men, Thu 17:00 to 19:00 U13 Academy + U15 + U17"
  priceline a camp      -> "1.295 kr to Sunday 1 November, then 1.495 kr", or "1.495 kr" once it has passed
  range   "16:15-18:00" -> 16:15 to 18:00
  (none)  the value as it is
  No filter ever writes a dash between two numbers (Deng's rule, qa-check fails it).

BLOCKS
  <!-- TALATA:FACTS:week:START --> ... END     the week as HTML + JSON (team pages: week-mini etc)
  <!-- TALATA:FACTS:org-ld:START --> ... END   wraps an ld+json <script>. Its JSON is kept and three
                                              keys are rewritten from facts: location (every venue but
                                              Heibergskolen), identifier (CVR) and
                                              openingHoursSpecification (standing training rows).
  <!-- TALATA:FACTS:place-ld:START --> ... END  the same, openingHoursSpecification only.

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
# Blocks: <!-- TALATA:FACTS:week:START --> ... <!-- TALATA:FACTS:week:END -->
BLOCK = re.compile(r"(<!-- TALATA:FACTS:([a-z-]+):START -->)(.*?)(<!-- TALATA:FACTS:\2:END -->)", re.S)


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


TODAY = None  # pin a date for a test; otherwise Copenhagen today
MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
SOON_DAYS = 7  # a row starting within a week is simply on the schedule


def _today():
    return TODAY or today_cph()


def _date(iso):
    import datetime as dt
    return dt.date.fromisoformat(iso) if iso else None


def standing(rows):
    """Rows that are part of the standing week today: not ended, not a one-off."""
    today = _today()
    out = []
    for r in rows:
        starts, ends = _date(r.get("starts")), _date(r.get("ends"))
        if ends and ends < today:
            continue
        if starts and ends and starts == ends:
            continue
        out.append(r)
    return out


def row_note(r):
    """" from 19 Oct" for a row that starts more than a week out, " until 9 Oct" for one that ends."""
    import datetime as dt
    today = _today()
    starts, ends = _date(r.get("starts")), _date(r.get("ends"))
    if starts and starts > today + dt.timedelta(days=SOON_DAYS):
        return " from %d %s" % (starts.day, MON3[starts.month - 1])
    if ends:
        return " until %d %s" % (ends.day, MON3[ends.month - 1])
    return ""


def _group(rows, label):
    groups = []
    for r in sorted(rows, key=lambda r: (r["start"], r["day"])):
        key = (r["start"], r["end"], label(r), row_note(r))
        for g in groups:
            if g["key"] == key:
                g["days"].append(r["day"])
                break
        else:
            groups.append({"key": key, "days": [r["day"]]})
    groups.sort(key=lambda g: (min(g["days"]), g["key"][0]))
    return [(" + ".join(DAY3[d] for d in sorted(set(g["days"]))),) + g["key"] for g in groups]


def sched(team):
    parts = ["%s %s to %s at %s%s" % g for g in _group(standing(team["sessions"]), lambda r: r["hall"])]
    if not parts:
        print("apply-facts: warning, %s has no standing sessions" % team.get("label"), file=sys.stderr)
    return ", ".join(parts)


def hall_sched(venue, doc):
    """Ongoing groups and times at one hall (6 Oct 2026, for /where-we-train)."""
    rows = [r for r in standing(doc.get("training") or []) if r.get("hall") == venue.get("name")]
    if not rows:
        raise ValueError("no training at %s" % venue.get("name"))
    return ", ".join("%s %s to %s %s%s" % g for g in _group(rows, lambda r: r["who"]))


def apply_filter(value, filt, doc=None):
    if filt == "kr":
        return num(value) + " kr"
    if filt == "num":
        return num(value)
    if filt == "sched":
        return sched(value)
    if filt == "hall":
        return hall_sched(value, doc or {})
    if filt == "sat":
        # Saturday sessions only, e.g. "10:00 to 11:00 at Kulturhuset Indre By" (2 Oct 2026)
        sat = [x for x in value.get("sessions", []) if x.get("day") == 5]
        if not sat:
            raise ValueError("no Saturday session for %s" % value.get("label"))
        return sched(dict(value, sessions=sat)).replace("Sat ", "", 1)
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


def esc(t):
    return (str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


DAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August",
               "September", "October", "November", "December"]


def block_week(doc, teams=None, games=None):
    """The whole week as plain HTML (crawlable, and what a phone without JS sees),
    plus the same rows as JSON for assets/talata-week.js, which redraws it as seven
    days from today with dates, days off and games (Website v3, 2 Oct 2026).

    teams: only rows for these team keys (a team page). games: the fixture team
    names that page shows, written as data-games; None shows every game."""
    today = _today()  # a row that has ended leaves the page (the JS skips it too)
    rows = sorted((r for r in doc["training"] if not (r.get("ends") and _date(r["ends"]) < today)),
                  key=lambda r: (r["day"], r["start"]))
    if teams is not None:
        rows = [r for r in rows if set(r.get("teams") or []) & set(teams)]
        if not rows:
            raise SystemExit("apply-facts: week block for %s has no training rows" % ", ".join(teams))
    attr = "" if games is None else ' data-games="%s"' % esc(",".join(games))
    out = ['\n<div class="wk-grid" data-talata-week%s>' % attr]
    for d in range(7):
        items = [r for r in rows if r["day"] == d]
        out.append('  <div class="wk-day"><h3>%s</h3>' % DAYS_FULL[d])
        if items:
            out.append("    <ul>")
            for r in items:
                out.append('      <li><b class="num">%s to %s</b> %s <span>%s</span></li>'
                           % (r["start"], r["end"], esc(r["who"]), esc(r["hall"])))
            out.append("    </ul>")
        else:
            out.append('    <p class="wk-none">No training</p>')
        out.append("  </div>")
    out.append("</div>")
    upd = (doc.get("sources") or {}).get("training_updated") or ""
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})$", upd)
    if m:  # "2 October 2026": no ISO dashes in visible copy
        upd = "%d %s %s" % (int(m.group(3)), MONTHS_FULL[int(m.group(2)) - 1], m.group(1))
    keep = [{k: r[k] for k in ("day", "start", "end", "who", "hall", "starts", "ends", "off")} for r in rows]
    out.append('<p class="wk-note">Times checked %s. Holiday changes show here first.</p>' % esc(upd))
    out.append('<script type="application/json" id="tw-week">%s</script>\n'
               % json.dumps(keep, ensure_ascii=False, separators=(",", ":")))
    return "\n".join(out)


# Team pages (Website v3 phase 3): their own rows and their own games only.
# Keys are team keys in data/facts.json; games are fixture team names.
TEAM_WEEKS = {
    "week-mini":    (["mini", "junior"], ["U9"]),
    "week-academy": (["academy_u13_u15", "academy_u15_u17", "academy_u17_u19", "open_gym"],
                     ["U13", "U15", "U17", "U19"]),
    "week-sparks":  (["sparks", "girls_15"], []),
    "week-men":     (["men"], ["Men"]),
}

DAYS_LD = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
NO_LD_VENUES = {"heibergskolen"}  # its address in the vault is "Sunday block", not a street
CVR = "43599453"


def opening_hours(doc):
    """openingHoursSpecification from the standing training rows (6 Oct 2026).
    One spec per day for what runs now. A row that starts more than a week out
    and widens that day adds a second spec with validFrom, and the first one
    gets validThrough the day before."""
    import datetime as dt
    soon = _today() + dt.timedelta(days=SOON_DAYS)
    rows = standing(doc.get("training") or [])
    out = []
    for d in range(7):
        day = [r for r in rows if r["day"] == d]
        now = [r for r in day if not r.get("starts") or _date(r["starts"]) <= soon]
        later = [r for r in day if r not in now]
        spec = None
        if now:
            spec = {"@type": "OpeningHoursSpecification", "dayOfWeek": [DAYS_LD[d]],
                    "opens": min(r["start"] for r in now), "closes": max(r["end"] for r in now)}
            out.append(spec)
        for start in sorted({r["starts"] for r in later}):
            span = now + [r for r in later if r["starts"] <= start]
            o, c = min(r["start"] for r in span), max(r["end"] for r in span)
            if spec and o == spec["opens"] and c == spec["closes"]:
                continue
            if spec:
                spec["validThrough"] = (_date(start) - dt.timedelta(days=1)).isoformat()
            spec = {"@type": "OpeningHoursSpecification", "dayOfWeek": [DAYS_LD[d]],
                    "opens": o, "closes": c, "validFrom": start}
            out.append(spec)
    return out


LD_SCRIPT = re.compile(r"(<script[^>]*application/ld\+json[^>]*>)(.*?)(</script>)", re.S)


def _ld_block(name, doc, inner):
    m = LD_SCRIPT.search(inner or "")
    if not m:
        raise SystemExit("apply-facts: block %s needs an ld+json <script> inside it" % name)
    data = json.loads(m.group(2))
    data.pop("openingHours", None)
    data["openingHoursSpecification"] = opening_hours(doc)
    if name == "org-ld":
        data["location"] = [{"@type": "SportsActivityLocation", "name": v["name"], "address": v["address"]}
                            for k, v in sorted((doc.get("venues") or {}).items()) if k not in NO_LD_VENUES]
        data["identifier"] = {"@type": "PropertyValue", "propertyID": "CVR", "value": CVR}
    pretty = '\n  "' in m.group(2)
    body = json.dumps(data, ensure_ascii=False, indent=2 if pretty else None,
                      separators=None if pretty else (",", ":"))
    return "\n%s\n%s\n%s\n" % (m.group(1), body, m.group(3))


BLOCKS = {"week": block_week,
          "org-ld": lambda doc, inner: _ld_block("org-ld", doc, inner),
          "place-ld": lambda doc, inner: _ld_block("place-ld", doc, inner)}
INNER_BLOCKS = {"org-ld", "place-ld"}
for _name, (_teams, _games) in TEAM_WEEKS.items():
    BLOCKS[_name] = (lambda t, g: lambda doc: block_week(doc, t, g))(_teams, _games)


def render_text(src, doc, where):
    def sub(m):
        path, filt = m.group(1), m.group(2)
        try:
            value = walk(doc, path)
        except KeyError:
            raise SystemExit("apply-facts: %s names %r, which is not in data/facts.json" % (where, path))
        out = apply_filter(value, filt, doc)
        if re.search(r"\d\s*[-–—]\s*\d", out):
            raise SystemExit("apply-facts: %s %r would print a dash between numbers: %r" % (where, path, out))
        return "<!--fact:%s%s-->%s<!--/fact-->" % (path, "|" + filt if filt else "", out)
    out = INLINE.sub(sub, src)

    def bsub(m):
        name = m.group(2)
        if name not in BLOCKS:
            raise SystemExit("apply-facts: %s has an unknown block %r" % (where, name))
        if name in INNER_BLOCKS:
            return m.group(1) + BLOCKS[name](doc, m.group(3)) + m.group(4)
        return m.group(1) + BLOCKS[name](doc) + m.group(4)
    return BLOCK.sub(bsub, out)


# Hand-typed facts that should live in a marker: a clock time or a kr price.
ORPHAN = re.compile(r"\b\d{1,2}:\d{2}\b|\b\d{1,2}[.,]\d{3}\s*(?:kr|DKK)\b|\b\d{3}\s*kr\b", re.I)


def visible(src):
    s = BLOCK.sub("", INLINE.sub("", src))
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
        if "<!--fact:" not in src and "TALATA:FACTS:" not in src:
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
