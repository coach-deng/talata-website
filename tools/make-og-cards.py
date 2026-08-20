#!/usr/bin/env python3
"""
Build 1200x630 social share cards, and point og:image at them.

WHY THIS EXISTS
Every page declares twitter:card=summary_large_image, which Facebook, WhatsApp,
LinkedIn and X all render at roughly 1.91:1. Most of the club's photography is
portrait, shot on a phone. Facebook does not letterbox a portrait into that slot,
it centre-crops it, so a 720x1600 game photo shared to the club page showed a
thin horizontal band across the player's chest. The page looked broken in exactly
the place we ask parents to share it.

WHAT IT DOES
For any og:image that is not already close to 1.91:1, render a 1200x630 crop into
images/og/ and repoint the page at it. The crop is biased toward the top of the
frame because these are photographs of people and heads are near the top. The
source file is never modified, so the in-page <img> keeps its full-height
version.

    python3 tools/make-og-cards.py           # build and rewrite
    python3 tools/make-og-cards.py --check   # report, change nothing
"""

import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OGDIR = ROOT / "images" / "og"
SITE = "https://talatabasketball.dk"

TARGET_W, TARGET_H = 1200, 630
TARGET_R = TARGET_W / TARGET_H          # 1.905
TOLERANCE = 0.10                        # anything within 10% is left alone

# How far down the source frame the crop window sits. 0.0 hugs the top edge,
# 0.5 is centred.
#
# This is opt-in per image on purpose. Facebook already centre-crops whatever we
# hand it, so generating our own crop is only worth shipping where a human has
# looked at the result and it beats centre. A blanket top-bias turned the Aarhus
# game photo into a picture of the sports hall ceiling: the subject was low in
# the frame, not high. Anything not listed here keeps its existing og:image.
DEFAULT_BIAS = 0.5

BIAS = {
    "/images/talata-huddle.jpg": 0.42,
    "/images/people/deng-awak.jpg": 0.10,
    "/images/hero-training.jpg": 0.40,
    "/images/jun26/team-photo-tunnel-arena.jpg": 0.35,
    "/images/action-game.jpg": 0.30,
    "/images/recovery-week-team-apr2026.jpg": 0.30,
    "/images/jun26/mini-session-group.jpg": 0.35,
    "/images/jul26/airborne-drive.jpg": 0.25,
}

SKIP_DIRS = ("images/junk", "Photos-001", "posters/")
SKIP_FILES = ("home-classic.html", "index-new.html", "hero-carousel-preview.html")

OG_RE = re.compile(r'(og:image"\s+content="' + re.escape(SITE) + r')([^"]+)(")')
TW_RE = re.compile(r'(twitter:image"\s+content="' + re.escape(SITE) + r')([^"]+)(")')


def pages():
    for p in sorted(ROOT.glob("**/*.html")):
        rel = p.relative_to(ROOT).as_posix()
        if any(d in rel for d in SKIP_DIRS) or rel in SKIP_FILES:
            continue
        yield p, rel


def build_card(src_rel):
    """Render a 1200x630 card for `src_rel`. Returns the new site path, or None."""
    src = ROOT / src_rel.lstrip("/")
    if not src.exists():
        return None
    im = Image.open(src).convert("RGB")
    w, h = im.size
    if abs((w / h) - TARGET_R) / TARGET_R <= TOLERANCE:
        return None                      # already the right shape

    # widest crop the source allows, positioned high in the frame
    cw = w
    ch = int(round(cw / TARGET_R))
    if ch > h:                           # source is too short: crop width instead
        ch = h
        cw = int(round(ch * TARGET_R))
    x = (w - cw) // 2
    y = int((h - ch) * BIAS.get(src_rel, DEFAULT_BIAS))
    card = im.crop((x, y, x + cw, y + ch)).resize((TARGET_W, TARGET_H), Image.LANCZOS)

    OGDIR.mkdir(parents=True, exist_ok=True)
    name = Path(src_rel).stem + "-og.jpg"
    card.save(OGDIR / name, quality=84, optimize=True)
    return "/images/og/" + name


def main():
    check = "--check" in sys.argv
    built, touched = {}, 0

    for path, rel in pages():
        src = path.read_text(encoding="utf-8")
        m = OG_RE.search(src)
        if not m:
            continue
        current = m.group(2)
        if current.startswith("/images/og/"):
            continue                     # already pointed at a card

        if current not in BIAS:
            continue                     # not reviewed, leave this page alone
        if current not in built:
            built[current] = build_card(current)
        new = built[current]
        if not new:
            print("%-46s ok already" % rel)
            continue

        out = OG_RE.sub(lambda mm: mm.group(1) + new + mm.group(3), src)
        out = TW_RE.sub(lambda mm: mm.group(1) + new + mm.group(3), out)
        # keep JSON-LD "image" in step with the tag above it
        out = out.replace('"image": "%s%s"' % (SITE, current), '"image": "%s%s"' % (SITE, new))
        if out != src:
            touched += 1
            print("%-46s %s -> %s" % (rel, current, new))
            if not check:
                path.write_text(out, encoding="utf-8")

    print("\n%d page(s) %s, %d card(s) rendered"
          % (touched, "would change" if check else "updated",
             len([v for v in built.values() if v])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
