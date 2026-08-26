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
           "#0a0a0a", "#0A0A0A", "#222", "#333",
           # The brand navy and blue. Correct as a FILL, invisible as type on
           # dark: #0B1F3A on #121824 measures 1.07:1.
           "#0b1f3a", "#0B1F3A", "#0b2545", "#0B2545"}
BRAND   = {"#1e40af", "#1E40AF", "#2c4fd8", "#2C4FD8", "#1d4ed8", "#1D4ED8"}
MUTED   = {"#555", "#666", "#475467", "#64748b", "#64748B", "#6b7280",
           "#6B7280", "#777", "#888", "#444", "#4a4a4a", "#4A4A4A",
           "#333333", "#3f3f46", "#3F3F46", "#52525b", "#52525B"}

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
        for lit in sorted(BRAND, key=len, reverse=True):
            if low == lit.lower():
                return "var(--td-link)"
        return None

    return None


# `color: var(--x)` needs its own pass, because map_decl() bails on any value
# containing var(). That bail was the worst dark-mode bug on the site: coach
# names on /coaches rendered at a contrast ratio of 1.1, invisible, because the
# page sets `color: var(--navy)` and the dark sheet had remapped --navy to a
# dark SURFACE. One variable, two jobs.
#
# A variable that names a surface or a brand fill is never a safe text colour on
# dark, so any `color:` pointing at one is rewritten to a token that is.
COLOR_VAR = {
    # surfaces and near-black brand tokens -> body text
    "navy": "--td-text", "black": "--td-text", "dark": "--td-text",
    "ink": "--td-text", "text": "--td-text", "talata-dark": "--td-text",
    "bg": "--td-text", "mist": "--td-text", "white": "--td-text",
    # brand fills. White on #2C4FD8 is fine; #2C4FD8 as type on a dark card
    # measures 2.67:1 and fails, so text gets the lighter link token.
    "blue": "--td-link", "talata": "--td-link", "blue-light": "--td-link",
    "baby": "--td-link", "sky": "--td-link", "gold": "--td-link",
    # already secondary, leave the meaning intact
    "ink2": "--td-muted", "text-muted": "--td-muted", "muted": "--td-muted",
    "line": "--td-muted", "border": "--td-muted",
}


def map_color_var(prop, value):
    if prop != "color":
        return None
    m = re.match(r"^\s*var\(--([a-z0-9-]+)\s*(?:,[^)]*)?\)\s*$", value, re.I)
    if not m:
        return None
    target = COLOR_VAR.get(m.group(1).lower())
    return f"var({target})" if target else None

    return None


DECL = re.compile(r"(^|[;{])\s*([a-z-]+)\s*:\s*([^;{}]+)", re.I)

# Backgrounds that stay light on a dark page: the two Talata accents. Text on
# them has to go dark, not light.
LIGHT_FILL = re.compile(
    r"background(?:-color)?\s*:\s*[^;{}]*"
    r"(#7dd3fc|#bae6fd|var\(--baby\)|var\(--sky\)|var\(--td-accent\)|var\(--td-accent-2\))",
    re.I,
)
COLOR_IN_RULE = re.compile(r"(^|[;{])(\s*color\s*:\s*)([^;{}]+)", re.I)


def fix_light_fill_rules(css):
    """Give any rule with a light accent fill dark text."""
    changed = [0]

    def one(m):
        body = m.group(2)
        if not LIGHT_FILL.search(body):
            return m.group(0)

        def recolor(c):
            val = c.group(3).strip().lower()
            if val in ("var(--td-bg)", "var(--td-navy)", "#0b0f17", "#121824"):
                return c.group(0)
            changed[0] += 1
            return f"{c.group(1)}{c.group(2)}var(--td-bg)"

        fixed = COLOR_IN_RULE.sub(recolor, body)
        if not COLOR_IN_RULE.search(fixed):
            fixed = fixed.rstrip().rstrip(";") + ";color:var(--td-bg)"
            changed[0] += 1
        return m.group(1) + fixed + m.group(3)

    return re.sub(r"(\{)([^{}]*)(\})", one, css), changed[0]


def convert_css(css):
    changes = [0]

    def one(m):
        head, prop, value = m.group(1), m.group(2).lower(), m.group(3)
        new = map_decl(prop, value)
        if new is None:
            new = map_color_var(prop, value)
        if new is None or new == value.strip():
            return m.group(0)
        changes[0] += 1
        return f"{head}{prop}:{new}"

    css, n = DECL.sub(one, css), changes[0]
    css, n2 = fix_light_fill_rules(css)
    return css, n + n2


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

    # Inline style="..." attributes get the same treatment. Missing them left
    # two links on /coaches at a contrast ratio of 2.36, because the colour was
    # written straight on the tag and never went near a <style> block.
    def inline(m):
        nonlocal total
        css, n = convert_css(m.group(2))
        # An inline style is a rule body with no braces, so wrap it before the
        # light-fill check and unwrap after.
        wrapped, n2 = fix_light_fill_rules("{" + css + "}")
        total += n + n2
        return m.group(1) + wrapped[1:-1] + m.group(3)

    src = re.sub(r'(\sstyle=")([^"]*)(")', inline, src)

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
