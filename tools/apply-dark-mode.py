#!/usr/bin/env python3
"""
Rewrite literal light colours inside each page's inline <style> to dark tokens.

WHY
---
Deng, 26 Aug 2026: "make the whole website dark, the white hurts the eyes."

assets/talata-dark.css flips every page that paints itself through a CSS
variable. It cannot touch a rule that hard-codes a colour, and 46 pages do:
`background:#fff` alone appears 136 times. Loading the dark sheet on its own
produced white panels holding near-white text, which is worse than the light
site it replaced. This closes that gap.

WHY IT IS PROPERTY-AWARE
------------------------
A blanket find-and-replace of #fff would break the site. `color:#fff` is
correct and must stay: it is white type sitting on a dark hero. Only the
colour of a SURFACE inverts, never the colour of INK that was already light.
So each declaration is read as `property: value` and mapped on the property:

    background / background-color   light  -> --td-surface (a panel)
                                    near-white page ground -> --td-bg
    border / border-*               light  -> --td-line
    color                           dark   -> --td-text
                                    mid grey -> --td-muted

Skipped on purpose:
  * anything containing gradient() or url(), where a flat token would destroy
    the effect the rule exists for
  * inline SVG, which carries its own fills and is not CSS
  * the partner strip, which keeps a light card because those brands supply
    colour marks and were deliberately moved onto light on 19 Aug 2026

USAGE
    python3 tools/apply-dark-mode.py            # rewrite
    python3 tools/apply-dark-mode.py --check    # report only, exit 1 if work remains
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"node_modules", "images", "fonts", "downloads"}

# Exact literals seen in this codebase, mapped by role. Anything not listed is
# left alone: a colour nobody recognised is safer untouched than guessed at.
SURFACE = {"#fff", "#ffffff", "#FFF", "#FFFFFF", "white"}
GROUND  = {"#fafafa", "#FAFAFA", "#f8fafc", "#F8FAFC", "#f9fafb", "#F9FAFB"}
LINE    = {"#e0e0e0", "#E0E0E0", "#e4e9f0", "#E4E9F0", "#eee", "#EEE",
           "#e5e7eb", "#E5E7EB", "#ddd", "#DDD", "#f0f0f0", "#F0F0F0"}
INK     = {"#1a1a1a", "#1A1A1A", "#101828", "#111", "#000", "#000000",
           "#0a0a0a", "#0A0A0A", "#222", "#333"}
MUTED   = {"#555", "#666", "#475467", "#64748b", "#64748B", "#6b7280",
           "#6B7280", "#777", "#888"}

BG_PROPS   = ("background", "background-color")
LINE_PROPS = ("border", "border-top", "border-bottom", "border-left",
              "border-right", "border-color", "outline")


def map_decl(prop, value):
    """Return a rewritten value, or None to leave the declaration alone."""
    v = value.strip()
    low = v.lower()
    if "gradient" in low or "url(" in low or "var(" in low:
        return None

    if prop in BG_PROPS:
        for lit in sorted(SURFACE | GROUND, key=len, reverse=True):
            if lit.lower() in low:
                token = "var(--td-bg)" if lit in GROUND else "var(--td-surface)"
                return re.sub(re.escape(lit), token, v, flags=re.I)
        return None

    if prop.startswith("border") or prop == "outline":
        for lit in sorted(LINE, key=len, reverse=True):
            if lit.lower() in low:
                return re.sub(re.escape(lit), "var(--td-line)", v, flags=re.I)
        return None

    if prop == "color":
        for lit in sorted(INK, key=len, reverse=True):
            if low == lit.lower():
                return "var(--td-text)"
        for lit in sorted(MUTED, key=len, reverse=True):
            if low == lit.lower():
                return "var(--td-muted)"
        return None

    return None


DECL = re.compile(r"(^|[;{])\s*([a-z-]+)\s*:\s*([^;{}]+)", re.I)


def convert_css(css):
    changes = [0]

    def one(m):
        head, prop, value = m.group(1), m.group(2).lower(), m.group(3)
        new = map_decl(prop, value)
        if new is None or new == value.strip():
            return m.group(0)
        changes[0] += 1
        return f"{head}{prop}:{new}"

    return DECL.sub(one, css), changes[0]


def process(path, check):
    src = path.read_text(encoding="utf-8")
    original = src
    total = 0

    def block(m):
        nonlocal total
        css, n = convert_css(m.group(2))
        total += n
        return m.group(1) + css + m.group(3)

    src = re.sub(r"(<style[^>]*>)(.*?)(</style>)", block, src, flags=re.S)

    if src != original and not check:
        path.write_text(src, encoding="utf-8")
    return total, src != original


def main():
    check = "--check" in sys.argv
    pages = sorted(
        p for p in ROOT.glob("**/*.html")
        if not any(part in SKIP_DIRS for part in p.parts)
    )
    touched = grand = 0
    for p in pages:
        n, changed = process(p, check)
        if n:
            print(f"  {p.relative_to(ROOT)!s:<52} {n} declaration(s)")
            touched += 1
            grand += n
    verb = "would rewrite" if check else "rewrote"
    print(f"\n{verb} {grand} declaration(s) across {touched} page(s) of {len(pages)}.")
    if check and grand:
        sys.exit(1)


if __name__ == "__main__":
    main()
