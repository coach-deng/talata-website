#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Link, anchor, orphan and title audit for the Talata site.

WHY THIS EXISTS
On 1 Sep 2026 an ad-hoc version of this found five real bugs in one pass:

  - /games was in the nav, in the footer and in NO sitemap at all
  - /ish-primary-school was linked from nowhere
  - partners.html opened an INTERNAL link with target="_blank"
  - 17 <title> tags ran past 65 chars and Google truncated every one
  - one of those titles said "Basketball i USA" for a camp held in Copenhagen

Then it was thrown away, so the next session would have had to rewrite it. This
is that script, kept.

🔴 THE CHECK THAT MATTERS MOST IS THE REDIRECT LOOP. The same day, the orphan
report told me to link /ish-primary-school. It has 302'd to /school-partnerships
since 6 Aug ON PURPOSE, so my "fix" sent readers to a page that bounced them back
to the page they were already on. The audit passed it because the route resolved.
A redirect is not a destination.

    python3 tools/link-check.py            # full report
    python3 tools/link-check.py --strict   # non-zero exit on notes too
"""
import argparse
import collections
import subprocess
import glob
import html
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TITLE_MAX = 65

# Pages nothing links to ON PURPOSE. An orphan here is expected, not a finding.
# Say why, so the next person does not "fix" it like I did.
DELIBERATE_ORPHANS = {
    "basketball-in-copenhagen.html": "SEO landing page, reached from search, not from the nav",
    "camps/spring-camp-2026.html":   "past camp, kept for its URL, canonical points at /camps",
    "ish-primary-school.html":       "HIDDEN since 6 Aug 2026, 302s to /school-partnerships while Ryparken is unconfirmed",
    "index.html":                    "the homepage is /, nothing links to /index",
}

SKIP_DIR_PARTS = ("/junk/", "/_unused/", "/Photos-", "/Basketball 2013",
                  "/node_modules/", "/instagram_posts/", "/Talata Website Photos/")


def pages():
    pat = ["*.html", "blog/*.html", "camps/*.html", "help/*.html",
           "philosophy/*.html", "reviews/*.html"]
    out = []
    for p in pat:
        out += glob.glob(os.path.join(ROOT, p))
    return sorted({os.path.relpath(p, ROOT) for p in out
                   if not any(s in "/" + p.replace(os.sep, "/") for s in SKIP_DIR_PARTS)})


def redirects():
    m = {}
    path = os.path.join(ROOT, "_redirects")
    if not os.path.isfile(path):
        return m
    for line in io.open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) >= 2:
            m[parts[0].rstrip("/") or "/"] = parts[1].rstrip("/") or "/"
    return m


def route_of(page):
    r = "/" + page[:-5]
    if r.endswith("/index"):
        r = r[:-6] or "/"
    return r


def servable(path, red):
    q = path.rstrip("/") or "/"
    if q in red:
        return True
    if q == "/":
        return os.path.isfile(os.path.join(ROOT, "index.html"))
    rel = q.lstrip("/")
    return (os.path.isfile(os.path.join(ROOT, rel))
            or os.path.isfile(os.path.join(ROOT, rel + ".html"))
            or os.path.isfile(os.path.join(ROOT, rel, "index.html")))


def tracked_files():
    """Cloudflare Pages deploys what git tracks. An image that exists on disk but
    is untracked works locally and 404s in production, which is invisible from a
    local check alone. The repo carries ~800 untracked photos (images/junk,
    images/_unused, Photos-001, Talata Website Photos), so this is a live trap."""
    try:
        out = subprocess.run(["git", "ls-files"], cwd=ROOT,
                             capture_output=True, text=True, timeout=30)
        return set(out.stdout.splitlines())
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true",
                    help="exit non-zero on notes as well as failures")
    args = ap.parse_args()

    red = redirects()
    ps = pages()
    tracked = tracked_files()
    sitemap = ""
    sm = os.path.join(ROOT, "sitemap.xml")
    if os.path.isfile(sm):
        sitemap = io.open(sm, encoding="utf-8").read()

    fails, notes = [], []
    linked = set()
    titles = collections.Counter()
    total_links = 0

    for f in ps:
        src = io.open(os.path.join(ROOT, f), encoding="utf-8").read()
        ids = set(re.findall(r'\bid="([^"]+)"', src))
        me = route_of(f)

        for href in re.findall(r'href="([^"]+)"', src):
            if href.startswith(("mailto:", "tel:", "http://", "https://",
                                "javascript:", "data:", "#!")):
                continue
            total_links += 1
            frag = ""
            if "#" in href:
                href, frag = href.split("#", 1)
            if not href:
                if frag and frag not in ids:
                    fails.append((f, "dead anchor", "#" + frag))
                continue
            path = href.split("?")[0]
            if path.startswith("/"):
                linked.add(path.rstrip("/") or "/")
                if not servable(path, red):
                    fails.append((f, "broken link", path))
                else:
                    # 🔴 the one that bit on 1 Sep
                    tgt = red.get(path.rstrip("/") or "/")
                    if tgt and tgt.rstrip("/") == me.rstrip("/"):
                        fails.append((f, "redirect loop", "%s -> %s" % (path, tgt)))
            else:
                rel = os.path.normpath(os.path.join(os.path.dirname(f), path))
                full = os.path.join(ROOT, rel)
                if not (os.path.isfile(full) or os.path.isfile(full + ".html")
                        or os.path.isdir(full)):
                    fails.append((f, "broken link", path))

        # an internal link should not open a new tab
        for tag in re.findall(r"<a\b[^>]*>", src):
            if 'target="_blank"' in tag:
                h = re.search(r'href="(/[^"]*)"', tag)
                if h:
                    notes.append((f, "internal link opens a new tab", h.group(1)))

        for s in re.findall(r'src="([^"]+\.(?:jpg|JPG|jpeg|png|svg|webp|avif))"', src):
            if s.startswith(("http://", "https://", "data:")):
                continue
            full = (os.path.join(ROOT, s.lstrip("/")) if s.startswith("/")
                    else os.path.join(ROOT, os.path.dirname(f), s))
            if not os.path.isfile(full):
                fails.append((f, "missing image", s))
            elif tracked is not None:
                rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
                if rel not in tracked:
                    fails.append((f, "image not in git, 404s in production", s))

        m = re.search(r"<title>(.*?)</title>", src, re.S)
        if not m:
            fails.append((f, "no <title>", ""))
        else:
            t = html.unescape(m.group(1)).strip()
            titles[t] += 1
            if len(t) > TITLE_MAX:
                notes.append((f, "title %d chars, Google truncates" % len(t), t[:60] + "…"))

        c = re.search(r'<link rel="canonical" href="([^"]+)"', src)
        if not c:
            notes.append((f, "no canonical", ""))
        else:
            cp = c.group(1).replace("https://talatabasketball.dk", "") or "/"
            if cp.rstrip("/") != me.rstrip("/") and (me.rstrip("/") or "/") not in red:
                notes.append((f, "canonical mismatch", "%s vs %s" % (cp, me)))

        if sitemap and me not in sitemap and f not in DELIBERATE_ORPHANS:
            notes.append((f, "not in sitemap.xml", me))

    for t, n in titles.items():
        if n > 1:
            fails.append(("(site)", "duplicate <title> on %d pages" % n, t[:60]))

    orphans = [f for f in ps
               if route_of(f) not in linked
               and route_of(f).rstrip("/") not in linked
               and f not in DELIBERATE_ORPHANS]

    print("Talata link check — %d pages, %d internal links\n" % (len(ps), total_links))

    def show(label, rows):
        print("=== %s: %d ===" % (label, len(rows)))
        for f, kind, detail in rows:
            print("  %-44s %-34s %s" % (f, kind, detail))
        print()

    show("FAIL", fails)
    show("notes", notes)
    print("=== orphans (nothing links to them): %d ===" % len(orphans))
    for o in orphans:
        print("  %s" % o)
    if not orphans:
        print("  none")
    print("\n  %d deliberate orphan(s) skipped: %s" %
          (len(DELIBERATE_ORPHANS), ", ".join(sorted(DELIBERATE_ORPHANS))))
    print("\n🔴 Before 'fixing' an orphan, read the comment above its rule in "
          "_redirects.\n   A page can be unlinked on purpose, and linking it can "
          "create a redirect loop.")

    bad = len(fails) + len(orphans) + (len(notes) if args.strict else 0)
    print("\nTOTAL blocking: %d" % (len(fails) + len(orphans)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
