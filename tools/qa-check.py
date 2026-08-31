#!/usr/bin/env python3
"""
Talata site QA. Voice, dark mode and structure, in one command.

    python3 tools/qa-check.py           # everything
    python3 tools/qa-check.py --voice   # copy only
    python3 tools/qa-check.py --dark    # dark mode only
    python3 tools/qa-check.py --quiet   # exit code only, for a hook

WHY THIS EXISTS
---------------
Every check here was written after the bug it catches shipped, on 26 Aug 2026:

  * Coach names on /coaches rendered #131A26 on #0B0F17, a contrast ratio of
    1.1. Invisible. One variable doing two jobs: --navy is right as a surface
    and fatal as `color:`.
  * "Booking open" pills put near-white type on the light baby-blue accent.
    The fill and the colour lived in two different rules, so neither could see
    the other.
  * Seven em and en dashes sat in <title> and og:title, which is the copy that
    Google and every social share show. The house rule bans them outright,
    ranges included.
  * Six "honestly" and one "The honest truth" heading.

WHAT IT DELIBERATELY DOES NOT DO
--------------------------------
It reads the CSS, it does not render the page, so it cannot see a colour that
arrives through inheritance from three ancestors up. For that, open the site
and measure computed styles. This catches the classes of bug that were actually
shipped, which all lived in a rule you can read.

It also reports negation openers WITHOUT failing on them. "No experience, no
tryouts" is ordinary reassurance, and rewriting every one of those is the same
mistake as a drift detector that fires 29 times on party budgets.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# posters/ holds standalone print artwork. It carries no site nav, is linked
# from no page, and is not meant to be read on screen, so the dark-mode and
# structure checks do not apply to it.
# "tools" added 27 Aug: contrast-runner.html lives there and is an internal
# harness, not a page. It has no nav and no dark stylesheet on purpose, and
# without this it fails three structural checks that do not apply to it.
SKIP = {"node_modules", "images", "fonts", "downloads", "junk", "posters", "tools"}

RED, YEL, GRN, DIM, OFF = "\033[31m", "\033[33m", "\033[32m", "\033[2m", "\033[0m"

LIGHT = r"(#fff\b|#ffffff|#7dd3fc|#bae6fd|#f8fafc|#fafafa|#f1f5f9|#eef2f7|var\(--baby\)|var\(--sky\)|var\(--td-accent\)|var\(--td-accent-2\))"
DARK_TEXT = r"(var\(--td-bg\)|var\(--td-navy\)|#0b0f17|#121824|#101828|#0b1f3a)"

# ---- the blind spot that let the /help/holdsport stop-box ship, 31 Aug 2026 ----
# `.box.stop { border-left:4px solid #C0392B; background:#FDECEA; }` cleared BOTH
# branches of check_dark() and the file reported Clean while the box measured
# 1.05:1. Two separate reasons, and each one is its own class of miss:
#
#   1. #FDECEA is not in LIGHT. LIGHT is a hand-kept list of the pale values
#      someone had already been bitten by, so it can only ever catch the last
#      bug, never the next one. A pale pink nobody had used before walked past
#      it. Measuring the luminance instead of matching the string catches every
#      pale fill, including the ones not invented yet.
#
#   2. The rule declares NO colour at all. The existing check only fires when a
#      fill and a colour sit in the SAME rule. Here the fill is on `.box.stop`
#      and the text colours are three rules away on `h3`, `p` and `b`. On a
#      dark-only site an undeclared colour inherits near-white body text, so a
#      light fill with no colour beside it is a defect by itself.
HEX = re.compile(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b")


def _luminance(hex6):
    h = hex6.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    def ch(v):
        v = int(v, 16) / 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * ch(h[0:2]) + 0.7152 * ch(h[2:4]) + 0.0722 * ch(h[4:6])


def _pale_fills(rule):
    """Literal hex fills in this rule that are light enough to need dark type."""
    m = re.search(r"background(?:-color)?\s*:([^;]*)", rule, re.I)
    if not m:
        return []
    return [h.group(0) for h in HEX.finditer(m.group(1)) if _luminance(h.group(0)) > 0.5]

CHECKS_VOICE = [
    ("em or en dash in visible copy", re.compile(r"[—–]"), True),
    ("em or en dash in title or meta", None, True),          # handled specially
    ("announcing honesty", re.compile(r"\b(honestly|the honest (truth|position|thing))\b", re.I), True),
    ("mirror, not X but Y", re.compile(r"\bnot [a-z]{3,20},? but\b", re.I), True),
    ("poster line", re.compile(r"(that (is|was) the (entire|whole)? ?point|what we can say is|worth sitting with|the clearest signal)", re.I), True),
    ("overexplain clause", re.compile(r"[.,;]\s*(which means|that is because)\b", re.I), True),
    ("opens on a negation", re.compile(r"(?<![a-zA-Z])(No|Nothing|Never|Not)\s+[a-z]{3,}[^.!?]{0,50}[.!?]"), False),
]

META = re.compile(
    r"(<title>[^<]*</title>|<meta[^>]*(?:name=\"(?:description|keywords)\"|property=\"og:(?:title|description)\")[^>]*>)",
    re.I,
)


def pages():
    return sorted(p for p in ROOT.glob("**/*.html") if not any(x in p.parts for x in SKIP))


def visible(src):
    s = re.sub(r"<(script|style)\b.*?</\1>", "", src, flags=re.S | re.I)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"&[a-zA-Z]+;|&#\d+;", " ", s)
    return re.sub(r"[ \t]+", " ", s)


def check_voice(fails, warns):
    for path in pages():
        src = path.read_text(encoding="utf-8")
        text = visible(src)
        rel = str(path.relative_to(ROOT))
        for name, pat, is_fail in CHECKS_VOICE:
            if pat is None:
                continue
            for m in pat.finditer(text):
                (fails if is_fail else warns).append((rel, name, m.group(0).strip()[:60]))
        for m in META.finditer(src):
            if "—" in m.group(0) or "–" in m.group(0):
                fails.append((rel, "em or en dash in title or meta", m.group(0)[:70]))


def check_dark(fails, warns):
    for path in pages():
        src = path.read_text(encoding="utf-8")
        rel = str(path.relative_to(ROOT))

        if "/assets/talata-dark.css" not in src:
            fails.append((rel, "dark stylesheet missing", "run tools/apply-shared-header.py"))

        for block in re.findall(r"<style[^>]*>(.*?)</style>", src, re.S):
            for rule in re.findall(r"\{([^{}]*)\}", block):
                has_light_fill = re.search(r"background(?:-color)?\s*:[^;]*" + LIGHT, rule, re.I)
                color = re.search(r"(?:^|;)\s*color\s*:\s*([^;]+)", rule, re.I)
                if has_light_fill and color and not re.search(DARK_TEXT, color.group(1), re.I):
                    fails.append((rel, "light fill with light text", rule.strip()[:60]))

                # Luminance-measured, so it does not depend on the pale value
                # already being on a list. A light fill either states dark type
                # in the same rule or it is a bug: with no colour beside it the
                # box inherits the page's near-white body text.
                # These land in NOTES, not FAILS, and that is deliberate. On the
                # 31 Aug tree this pass raised nine rules and NONE of them was a
                # rendered failure: three dead `.track` rules with no markup, two
                # #ddd placeholders behind <img> (a fill with no text on it), two
                # form fields that talata-dark.css already overrides with
                # !important, and two gradient corners. A check that turns the
                # build red on nine non-bugs gets muted inside a week, which is
                # the drift detector that fired 29 times on party budgets. It is
                # a rule-shape warning, so it reads as one.
                pale = _pale_fills(rule)
                if pale and not re.search(r"\b(object-fit|appearance)\b", rule, re.I):
                    if not color:
                        warns.append((rel, "light fill, no text colour declared",
                                      f"{pale[0]} in {rule.strip()[:44]}"))
                    elif not re.search(DARK_TEXT, color.group(1), re.I) and not any(
                        _luminance(h.group(0)) < 0.25 for h in HEX.finditer(color.group(1))
                    ):
                        warns.append((rel, "light fill with light text (measured)",
                                      f"{pale[0]} + {color.group(1).strip()[:30]}"))
                if color and re.search(r"var\(--(navy|black|dark|ink)\)|#0b1f3a", color.group(1), re.I):
                    fails.append((rel, "text coloured with a surface token", color.group(1).strip()[:44]))
            for m in re.finditer(r"background(?:-color)?\s*:\s*(#fff\b|#ffffff|#fafafa)", block, re.I):
                fails.append((rel, "literal white background left", m.group(0)))


def check_structure(fails, warns):
    versions = set()
    for path in pages():
        src = path.read_text(encoding="utf-8")
        rel = str(path.relative_to(ROOT))
        for marker in ("TALATA:HEADER:START", "TALATA:FOOTER:START"):
            if src.count(marker) != 1:
                fails.append((rel, "generated block missing or duplicated", marker))
        versions |= set(re.findall(r"talata-(?:fixtures|dark)\.(?:js|css)\?v=([0-9a-z]+)", src))
    if len(versions) > 1:
        fails.append(("site-wide", "asset versions disagree", ", ".join(sorted(versions))))
    elif not versions:
        warns.append(("site-wide", "no asset version stamp", "cache will serve stale files"))


def main():
    only = {a.lstrip("-") for a in sys.argv[1:] if a.startswith("--")} - {"quiet"}
    quiet = "--quiet" in sys.argv
    fails, warns = [], []

    if not only or "voice" in only:
        check_voice(fails, warns)
    if not only or "dark" in only:
        check_dark(fails, warns)
    if not only or "structure" in only:
        check_structure(fails, warns)

    if not quiet:
        for label, colour, rows in (("FAIL", RED, fails), ("note", YEL, warns)):
            if not rows:
                continue
            print(f"\n{colour}{label}{OFF}  {len(rows)}")
            seen = set()
            for rel, name, detail in rows:
                key = (rel, name)
                if key in seen:
                    continue
                seen.add(key)
                same = sum(1 for r, n, _ in rows if (r, n) == key)
                more = f" {DIM}(x{same}){OFF}" if same > 1 else ""
                print(f"  {rel:<46} {name}{more}\n      {DIM}{detail}{OFF}")

        print()
        if fails:
            print(f"{RED}{len(fails)} problem(s).{OFF} Notes above are judgement calls, not bugs.")
        else:
            print(f"{GRN}Clean.{OFF} {len(warns)} note(s), none of them failures.")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
