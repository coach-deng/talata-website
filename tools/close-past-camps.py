#!/usr/bin/env python3
"""
Put finished camps into a recap state.

These pages earn search traffic, so they stay up rather than getting redirected.
What they must not do is keep taking registrations for a camp that has already
run. This adds a banner under the header and swaps each live registration form
for a "closed, here is the next one" card.

Idempotent: re-running replaces the injected blocks instead of stacking them.
When a camp finishes, add it to PAST and run this.

    python3 tools/close-past-camps.py            # apply
    python3 tools/close-past-camps.py --check    # report only
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Two camps run side by side in week 42, so this points at the index rather
# than at one of them. /camps/autumn-camp-2026 is the 13-15 page now, and a
# parent coming off the U9-U11 recap should not land there.
NEXT_HREF = "/camps"
NEXT_LABEL = "Autumn Camps, Oct 12, 14 and 15"

# page -> the line under the banner headline
PAST = {
    "camps/dk-summer-camp-2026.html":
        "DK Summer Camp ran Aug 3 to 7 2026 at N&oslash;rre F&aelig;lled Skole. "
        "Registration is closed.",
    "camps/dk-mini-summer-camp-2026.html":
        "The younger track ran Aug 4 to 7 2026 at N&oslash;rre F&aelig;lled Skole. "
        "Registration is closed.",
    "camps/nida-camp-2026.html":
        "Nida Camp ran Jul 25 to Aug 2 2026 in Lithuania. Registration is closed.",
    "camps/lithuania-camp-2026.html":
        "Our 2026 Lithuania week has finished. Registration is closed.",
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


def strip_form(src):
    """Replace the first <form>...</form>, counting nested tags."""
    m = FORM_OPEN.search(src)
    if not m:
        return src, False
    depth = 0
    for t in re.finditer(r"<(/?)form\b[^>]*>", src[m.start():], re.I):
        depth += -1 if t.group(1) else 1
        if depth == 0:
            end = m.start() + t.end()
            card = CLOSED.format(s=F_START, e=F_END, href=NEXT_HREF, label=NEXT_LABEL)
            return src[:m.start()] + card + src[end:], True
    return src, False


def main():
    check = "--check" in sys.argv
    changed = 0
    for rel, note in PAST.items():
        path = ROOT / rel
        if not path.exists():
            print("  MISSING %s" % rel)
            continue
        src = original = path.read_text(encoding="utf-8")
        notes = []

        banner = BANNER.format(s=B_START, e=B_END, note=note,
                               href=NEXT_HREF, label=NEXT_LABEL)
        if BANNER_RE.search(src):
            src = BANNER_RE.sub(lambda _: banner, src, count=1)
            notes.append("banner refreshed")
        elif HEADER_END in src:
            src = src.replace(HEADER_END, HEADER_END + "\n\n" + banner, 1)
            notes.append("banner added")
        else:
            notes.append("NO HEADER MARKER, skipped banner")

        if CLOSED_RE.search(src):
            card = CLOSED.format(s=F_START, e=F_END, href=NEXT_HREF, label=NEXT_LABEL)
            src = CLOSED_RE.sub(lambda _: card, src, count=1)
            notes.append("closed card refreshed")
        else:
            src, did = strip_form(src)
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
