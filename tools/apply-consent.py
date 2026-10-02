#!/usr/bin/env python3
"""
Cookie consent on every page (Website v3, 2 Oct 2026).

Until 2 Oct every page loaded Google Analytics straight from its <head>, with no
consent. In Denmark analytics cookies need a yes first. This swaps the inline GA
snippet for a Consent Mode v2 stub (everything "denied") plus
assets/talata-consent.js, which loads gtag.js only after Accept. It also puts
assets/talata-track.js on the pages that lacked it, so every page measures the
same events once a visitor says yes.

    python3 tools/apply-consent.py           rewrite pages
    python3 tools/apply-consent.py --check   exit 1 if any page still loads GA
                                             directly, or lacks the stub or track.js

qa-check.py also fails on any googletagmanager.com URL in a page.
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = ("tools/", "node_modules/", "dist/", ".git/")

GA = re.compile(r"[ \t]*<script async src=\"https://www\.googletagmanager\.com/gtag/js\?id=G-R64Y9CQ2VZ\"></script>\s*"
                r"<script>\s*window\.dataLayer = window\.dataLayer \|\| \[\];\s*function gtag\(\)\{dataLayer\.push\(arguments\);\}\s*"
                r"gtag\('js', new Date\(\)\);\s*gtag\('config', 'G-R64Y9CQ2VZ'\);\s*</script>\n?", re.S)

STAMP_RE = re.compile(r"/assets/talata-[a-z-]+\.(?:js|css)\?v=([0-9a-z]+)")

STUB = """  <!-- TALATA:CONSENT. Google loads only after Accept (tools/apply-consent.py). -->
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('consent', 'default', {ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', wait_for_update: 500});
    gtag('js', new Date());
  </script>
  <script src="/assets/talata-consent.js?v=%s" defer></script>
"""


def pages():
    out = []
    for p in sorted(glob.glob(os.path.join(ROOT, "**/*.html"), recursive=True)):
        rel = os.path.relpath(p, ROOT)
        if rel.startswith(SKIP):
            continue
        out.append((p, rel))
    return out


def stamp_of(src):
    m = STAMP_RE.search(src)
    return m.group(1) if m else "20261002a"


def fix(src):
    s = src
    stamp = stamp_of(s)
    if "TALATA:CONSENT" not in s:
        if GA.search(s):
            s = GA.sub(STUB % stamp, s, count=1)
        elif "</head>" in s and "<meta charset" in s:
            s = s.replace("</head>", STUB % stamp + "</head>", 1)
    if "talata-track.js" not in s and "</body>" in s:
        s = s.replace("</body>", '<script src="/assets/talata-track.js?v=%s" defer></script>\n</body>' % stamp, 1)
    return s


def main(argv):
    check = "--check" in argv
    bad = []
    for path, rel in pages():
        src = open(path, encoding="utf-8").read()
        if "<html" not in src.lower():
            continue
        out = fix(src)
        problems = []
        if "googletagmanager.com" in out and "TALATA:CONSENT" not in out:
            problems.append("loads Google directly")
        if out != src:
            problems.append("needs the consent stub or track.js")
            if not check:
                open(path, "w", encoding="utf-8").write(out)
        if problems:
            bad.append((rel, problems))
    if check and bad:
        for rel, p in bad:
            print("  %-48s %s" % (rel, ", ".join(p)))
        print("apply-consent: %d page(s) not consent-safe. Run python3 tools/apply-consent.py" % len(bad))
        return 1
    print("apply-consent: %s" % ("%d page(s) updated" % len(bad) if bad and not check else "every page consent-safe"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
