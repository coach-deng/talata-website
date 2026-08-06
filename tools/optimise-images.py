#!/usr/bin/env python3
"""
Image hygiene for the HTML: lazy loading and intrinsic dimensions.

Two problems this fixes:
  1. Most <img> tags had no loading="lazy", so /blog pulled every photo on load.
  2. Almost none had width/height, so the page jumped around as photos arrived.

The first image on a page stays eager and gets fetchpriority="high" — it is the
hero, and lazy-loading it delays the thing the visitor came to see.

    python3 tools/optimise-images.py            # apply
    python3 tools/optimise-images.py --check    # report only
"""

import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SKIP = {"index-new.html", "home-classic.html", "hero-carousel-preview.html"}

IMG = re.compile(r"<img\b[^>]*>", re.I)


def resolve(src, page):
    """Map an img src to a file on disk, relative or absolute."""
    src = re.sub(r"^https?://talatabasketball\.dk", "", src).split("?")[0]
    if src.startswith("//") or src.startswith("http"):
        return None
    candidates = (
        ROOT / src.lstrip("/"),
        (page.parent / src).resolve(),
        ROOT / "images" / Path(src).name,
    )
    for c in candidates:
        if c.exists() and c.is_file():
            return c
    return None


def main():
    check = "--check" in sys.argv
    pages = sorted(
        p for p in ROOT.glob("**/*.html")
        if "node_modules" not in p.parts and p.name not in SKIP
    )
    lazied = sized = 0

    for page in pages:
        src_text = original = page.read_text(encoding="utf-8")
        seen = 0
        out, last = [], 0

        for m in IMG.finditer(original):
            tag = m.group(0)
            seen += 1
            new = tag

            def add(markup, attr):
                """Append an attribute, keeping any XHTML-style trailing slash last."""
                body = markup[:-1].rstrip()
                selfclose = body.endswith("/")
                if selfclose:
                    body = body[:-1].rstrip()
                return body + " " + attr + (" />" if selfclose else ">")

            if seen == 1:
                # hero: never lazy, and tell the browser it matters
                new = re.sub(r'\s+loading="lazy"', "", new)
                if "fetchpriority=" not in new:
                    new = add(new, 'fetchpriority="high"')
            elif "loading=" not in new:
                new = add(new, 'loading="lazy"')
                lazied += 1

            if "decoding=" not in new:
                new = add(new, 'decoding="async"')

            if "width=" not in new and "height=" not in new:
                sm = re.search(r'src="([^"]+)"', new)
                path = resolve(sm.group(1), page) if sm else None
                if path:
                    try:
                        w, h = Image.open(path).size
                        new = add(new, 'width="%d" height="%d"' % (w, h))
                        sized += 1
                    except Exception:
                        pass

            out.append(original[last:m.start()])
            out.append(new)
            last = m.end()

        out.append(original[last:])
        src_text = "".join(out)

        if src_text != original and not check:
            page.write_text(src_text, encoding="utf-8")

    print("lazy added: %d   dimensions added: %d   (%s)"
          % (lazied, sized, "dry run" if check else "written"))


if __name__ == "__main__":
    main()
