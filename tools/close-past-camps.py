#!/usr/bin/env python3
"""
Put finished camps into a recap state.

These pages earn search traffic, so they stay up rather than getting redirected.
What they must not do is keep taking registrations for a camp that has already
run. This adds a banner under the header and swaps each live registration form
for a "closed, here is the next one" card.

Idempotent: re-running replaces the injected blocks instead of stacking them.
When a camp finishes, add it to PAST and run this. A camp that has not run yet
goes in CLOSES with the day it closes, and joins PAST on that day by itself, so
running this early never shuts a camp that is still selling.

    python3 tools/close-past-camps.py                         # apply
    python3 tools/close-past-camps.py --check                 # report only
    python3 tools/close-past-camps.py --check --today=2026-10-16   # rehearse a date

Any other flag stops the script. An unknown flag used to fall through to apply
mode (the same trap that rewrote data/fixtures.json on 7 Oct 2026).
"""

import datetime as dt
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Where the banner and the closed card send people: the first camp in this list
# that has not closed yet. Two October camps run side by side in week 42, so
# until they close it points at the index rather than at one of them.
# (closes, href, label), in date order. Updated 7 Oct 2026.
NEXT = [
    ("2026-10-16", "/camps", "October camps, Oct 12 to 15"),
    ("2026-12-31", "/camps/college-pathway-camp-2026", "College Pathway Camp, Dec 28 to 30"),
]
FALLBACK = ("/camps", "All camps")

# Camps still to run: page -> (the day it closes, the line under the banner).
# Academy U12 Camp and Academy U15 Camp run Mon 12 to Thu 15 Oct 2026 at
# Hafnia-Hallen and close on Fri 16 Oct.
CLOSES = {
    "camps/academy-u12-camp-2026.html": ("2026-10-16",
        "Academy U12 Camp ran Oct 12 to 15 2026 at Hafnia-Hallen. Registration is closed."),
    "camps/academy-u15-camp-2026.html": ("2026-10-16",
        "Academy U15 Camp ran Oct 12 to 15 2026 at Hafnia-Hallen. Registration is closed."),
}

# page -> the line under the banner headline
PAST = {
    # The two 2026 summer pages were retired 6 Oct 2026: both 301 to
    # /camps/summer-camp, the evergreen summer page with the 2027 list.
    # camps/lithuania-camp-2026.html came out on 7 Oct 2026: the page is gone
    # and _redirects sends it to the Nida page.
    "camps/nida-camp-2026.html":
        "Nida Camp ran Jul 25 to Aug 2 2026 in Lithuania. Registration is closed.",
    "camps/canada-camp-2026.html":
        "Canada Camp ran Jun 27 to Jul 7 2026 in Lethbridge, Alberta. "
        "We are back in 2027.",
    "camps/spring-camp-u13-u15-2026.html":
        "Spring Camp U13-U15 ran in May 2026. Registration is closed.",
    "camps/spring-camp-u9-u11-2026.html":
        "Spring Camp U9-U11 ran in May 2026. Registration is closed.",
}

B_START = "<!-- TALATA:PASTCAMP:START -->"
B_END = "<!-- TALATA:PASTCAMP:END -->"
F_START = "<!-- TALATA:CLOSEDFORM:START -->"
F_END = "<!-- TALATA:CLOSEDFORM:END -->"

BANNER = """{s}
<div class="tn-past">
  <div class="tn-past-in">
    <div>
      <b>This camp has finished</b>
      <p>{note}</p>
    </div>
    <a class="tn-past-cta" href="{href}">{label} <span aria-hidden="true">&rarr;</span></a>
  </div>
</div>
{e}"""

CLOSED = """{s}
<div class="tn-closed">
  <b>Registration closed</b>
  <p>This camp has already run. Our next camp is open now.</p>
  <a href="{href}">{label} <span aria-hidden="true">&rarr;</span></a>
</div>
{e}"""

BANNER_RE = re.compile(re.escape(B_START) + r".*?" + re.escape(B_END), re.S)
CLOSED_RE = re.compile(re.escape(F_START) + r".*?" + re.escape(F_END), re.S)
FORM_OPEN = re.compile(r"<form\b[^>]*>", re.I)
HEADER_END = "<!-- TALATA:HEADER:END -->"


def today_cph():
    try:
        from zoneinfo import ZoneInfo
        return dt.datetime.now(ZoneInfo("Europe/Copenhagen")).date().isoformat()
    except Exception:  # noqa: BLE001
        return dt.date.today().isoformat()


def next_camp(today):
    for closes, href, label in NEXT:
        if today < closes:
            return href, label
    return FALLBACK


def past_on(today):
    """PAST plus every CLOSES camp whose close day has come."""
    out = dict(PAST)
    for rel, (closes, note) in CLOSES.items():
        if today >= closes:
            out[rel] = note
    return out


def strip_form(src, href, label):
    """Replace the first <form>...</form>, counting nested tags."""
    m = FORM_OPEN.search(src)
    if not m:
        return src, False
    depth = 0
    for t in re.finditer(r"<(/?)form\b[^>]*>", src[m.start():], re.I):
        depth += -1 if t.group(1) else 1
        if depth == 0:
            end = m.start() + t.end()
            card = CLOSED.format(s=F_START, e=F_END, href=href, label=label)
            return src[:m.start()] + card + src[end:], True
    return src, False


def main():
    args = sys.argv[1:]
    check = "--check" in args
    today = today_cph()
    for a in args:
        if a == "--check":
            continue
        if re.fullmatch(r"--today=\d{4}-\d{2}-\d{2}", a):
            today = a.split("=", 1)[1]
            continue
        sys.exit("close-past-camps: unknown argument %r. Use --check and/or --today=YYYY-MM-DD." % a)
    if not check and "--today" in " ".join(args):
        sys.exit("close-past-camps: --today only rehearses. Use it with --check.")

    next_href, next_label = next_camp(today)
    print("today %s, next camp: %s (%s)\n" % (today, next_label, next_href))
    changed = 0
    for rel, note in past_on(today).items():
        path = ROOT / rel
        if not path.exists():
            print("  MISSING %s" % rel)
            continue
        src = original = path.read_text(encoding="utf-8")
        notes = []

        banner = BANNER.format(s=B_START, e=B_END, note=note,
                               href=next_href, label=next_label)
        if BANNER_RE.search(src):
            src = BANNER_RE.sub(lambda _: banner, src, count=1)
            notes.append("banner refreshed")
        elif HEADER_END in src:
            src = src.replace(HEADER_END, HEADER_END + "\n\n" + banner, 1)
            notes.append("banner added")
        else:
            notes.append("NO HEADER MARKER, skipped banner")

        if CLOSED_RE.search(src):
            card = CLOSED.format(s=F_START, e=F_END, href=next_href, label=next_label)
            src = CLOSED_RE.sub(lambda _: card, src, count=1)
            notes.append("closed card refreshed")
        else:
            src, did = strip_form(src, next_href, next_label)
            if did:
                notes.append("form replaced")

        if src != original:
            changed += 1
            if not check:
                path.write_text(src, encoding="utf-8")
        print("%-46s %s" % (rel, ", ".join(notes)))

    print("\n%d page(s) %s" % (changed, "would change" if check else "updated"))


if __name__ == "__main__":
    main()
