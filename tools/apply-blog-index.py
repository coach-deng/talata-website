#!/usr/bin/env python3
"""
Generate every blog listing on the site from the posts themselves.

WHY THIS EXISTS
On 20 Aug 2026 three posts were written, committed and pushed. All three were
live and correct at their own URLs. None of them appeared anywhere a reader
would look: /blog still featured a post from 11 Aug and buried the new three at
positions 11, 12 and 13, and the homepage showed a camp recap from July.

Nothing was broken. Publishing a post just took four hand-edits, and only one of
them had been done:

    1. write blog/<slug>.html                      <- done
    2. hand-add a card to blog.html                <- and put it in date order
    3. hand-edit index.html, in TWO places         <- two separate story blocks
    4. hand-add a <url> block to sitemap.xml

Now step 1 is the whole job. Every listing is generated from the post's own
metadata, sorted by its own datePublished.

WHAT A POST MUST CARRY
    "datePublished": "YYYY-MM-DD"     in the JSON-LD. This is the sort key.
    <meta property="og:title">        the short headline used on cards.
    <meta property="og:description">  the card blurb.
    <meta name="talata:kicker">       "Player News", "Camp Recap", ...
    <meta name="talata:event">        "August 2026", "2025", "Spring 2026".
                                      When the story happened, which is not
                                      always when it was published. Malthe
                                      committed to Orangeville in 2025; the post
                                      went up in Aug 2026.
    <meta name="talata:card-image">   local path, e.g. /images/foo.jpg
    <meta name="talata:card-alt">     alt text
    <meta name="talata:card-w/-h">    intrinsic size, so cards never shift layout
    <meta name="talata:read">         minutes, an integer

A post missing any of these is reported and skipped rather than half-rendered.

    python3 tools/apply-blog-index.py            # apply
    python3 tools/apply-blog-index.py --check    # report, change nothing
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLOG = ROOT / "blog"
SITE = "https://talatabasketball.dk"

# How many posts each surface shows.
HOME_LATEST = 2       # the image-led block near the top of the homepage
HOME_PLAYBOOK = 3     # the text-card band lower down

MONTHS = ("January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December")

REQUIRED = ("date", "title", "desc", "kicker", "event", "image", "alt", "w", "h", "read")


def meta(src: str, name: str):
    m = re.search(
        r'<meta\s+(?:name|property)="%s"\s+content="([^"]*)"' % re.escape(name), src
    )
    return m.group(1).strip() if m else ""


def read_post(path: Path):
    src = path.read_text(encoding="utf-8")
    d = re.search(r'"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})"', src)
    post = {
        "slug": path.stem,
        "date": d.group(1) if d else "",
        "title": meta(src, "og:title"),
        "desc": meta(src, "og:description"),
        "kicker": meta(src, "talata:kicker"),
        "event": meta(src, "talata:event"),
        "image": meta(src, "talata:card-image"),
        "alt": meta(src, "talata:card-alt"),
        "w": meta(src, "talata:card-w"),
        "h": meta(src, "talata:card-h"),
        "read": meta(src, "talata:read"),
    }
    post["missing"] = [k for k in REQUIRED if not post[k]]
    return post


def load_posts():
    posts = [read_post(p) for p in sorted(BLOG.glob("*.html"))]
    bad = [p for p in posts if p["missing"]]
    good = [p for p in posts if not p["missing"]]
    # newest first. Same-day ties keep filename order so the result is stable.
    good.sort(key=lambda p: p["date"], reverse=True)
    return good, bad


def kicker_line(p):
    return "%s &middot; %s" % (p["kicker"], p["event"])


def meta_line(p):
    return "%s &middot; %s min read" % (p["event"], p["read"])


def missing_image(p):
    """Cards must not point at an image that is not on disk."""
    return not (ROOT / p["image"].lstrip("/")).exists()


# ---------------------------------------------------------------- blog.html

def render_blog_list(posts):
    lead, rest = posts[0], posts[1:]
    cards = []
    for p in rest:
        cards.append(
            """
      <a href="/blog/{slug}" class="post-card">
        <img src="{image}" alt="{alt}" class="thumb" loading="lazy" decoding="async" width="{w}" height="{h}" />
        <div class="card-body">
          <div class="card-tag">{kicker}</div>
          <h3>{title}</h3>
          <p>{desc}</p>
          <div class="meta">{meta}</div>
        </div>
      </a>""".format(
                slug=p["slug"], image=p["image"], alt=p["alt"], w=p["w"], h=p["h"],
                kicker=kicker_line(p), title=p["title"], desc=p["desc"], meta=meta_line(p)
            )
        )

    return """  <!-- FEATURED POST -->
  <div class="featured-wrap">
    <div class="featured-label">Latest post</div>
    <a href="/blog/{slug}" class="featured-card">
      <img src="{image}" alt="{alt}" class="card-img" fetchpriority="high" decoding="async" width="{w}" height="{h}" />
      <div class="card-body">
        <div class="card-tag">{kicker}</div>
        <h2>{title}</h2>
        <p>{desc}</p>
        <div class="meta">{meta}</div>
        <span class="read-more" style="margin-top:20px;">Read post &rarr;</span>
      </div>
    </a>
  </div>

  <!-- MORE POSTS -->
  <div class="grid-wrap">
    <div class="grid-label">More posts</div>
    <div class="posts-grid">
{cards}

    </div>
  </div>""".format(
        slug=lead["slug"], image=lead["image"], alt=lead["alt"], w=lead["w"], h=lead["h"],
        kicker=kicker_line(lead), title=lead["title"], desc=lead["desc"],
        meta=meta_line(lead), cards="\n".join(cards)
    )


# --------------------------------------------------------------- index.html

def render_home_latest(posts):
    """Image-led block: one big story, then side cards. The /reviews card stays
    pinned as the last side card. It is not a post, it is the trust signal, and
    it outperforms anything we write."""
    lead = posts[0]
    side = posts[1:HOME_LATEST]
    side_html = []
    for p in side:
        side_html.append(
            """        <a class="story" href="/blog/{slug}">
          <img src="{image}" alt="{alt}" decoding="async" width="{w}" height="{h}">
          <div class="grad"></div>
          <div class="txt"><span class="tag">{kicker}</span><h3>{title}</h3></div>
        </a>""".format(
                slug=p["slug"], image=p["image"].lstrip("/"), alt=p["alt"],
                w=p["w"], h=p["h"], kicker=p["kicker"], title=p["title"]
            )
        )
    side_html.append(
        """        <a class="story" href="/reviews">
          <img src="images/mini-group-fun.jpg" alt="Talata Mini kids laughing at training" decoding="async" width="1600" height="902">
          <div class="grad"></div>
          <div class="txt"><span class="tag">Parents</span><h3>What families say about us</h3></div>
        </a>"""
    )

    return """    <div class="head"><h2>Latest from <i>the club</i></h2><a href="/blog">All stories &rarr;</a></div>
    <div class="latest">
      <a class="story" href="/blog/{slug}">
        <img src="{image}" alt="{alt}" fetchpriority="high" decoding="async" width="{w}" height="{h}">
        <div class="grad"></div>
        <div class="txt"><span class="tag">{kicker}</span><h3>{title}</h3><p>{desc}</p></div>
      </a>
      <div class="sidecards">
{side}
      </div>
    </div>""".format(
        slug=lead["slug"], image=lead["image"].lstrip("/"), alt=lead["alt"],
        w=lead["w"], h=lead["h"], kicker=lead["kicker"], title=lead["title"],
        desc=lead["desc"], side="\n".join(side_html)
    )


def render_home_playbook(posts):
    """Text-card band lower down. Shows the next posts after the ones already in
    the block above, so the homepage never lists the same story twice."""
    shown = {p["slug"] for p in posts[:HOME_LATEST]}
    picks = [p for p in posts if p["slug"] not in shown][:HOME_PLAYBOOK]
    cards = "".join(
        '\n      <a class="fcard" href="/blog/%s"><b>%s</b><span>%s</span><i>Read &rarr;</i></a>'
        % (p["slug"], p["title"], p["desc"])
        for p in picks
    )
    return """    <div class="head"><h2>From <i>The Playbook</i></h2><a href="/blog">All posts &rarr;</a></div>
    <div class="fgrid2">%s
    </div>""" % cards


# --------------------------------------------------------------- sitemap.xml

def render_sitemap_blog(posts):
    out = []
    for p in posts:
        out.append(
            "  <url>\n"
            "    <loc>%s/blog/%s</loc>\n"
            "    <lastmod>%s</lastmod>\n"
            "    <changefreq>monthly</changefreq>\n"
            "    <priority>0.6</priority>\n"
            "  </url>" % (SITE, p["slug"], p["date"])
        )
    return "\n".join(out)


# -------------------------------------------------------------------- apply

BLOCKS = [
    ("blog.html", "POSTS", render_blog_list),
    ("index.html", "LATEST", render_home_latest),
    # The homepage's second "From The Playbook" row came out on 26 Aug when the
    # page was reordered to follow zalgiris.lt. With 14 posts, two rows showed
    # the same posts twice. render_home_playbook is kept below in case a
    # dedicated featured row comes back once there is enough to fill it.
    ("sitemap.xml", "BLOG", render_sitemap_blog),
]


def marker(name, kind):
    if kind == "start":
        return "<!-- TALATA:%s:START — generated by tools/apply-blog-index.py, do not hand-edit -->" % name
    return "<!-- TALATA:%s:END -->" % name


def apply_block(path: Path, name: str, body: str, check: bool):
    src = original = path.read_text(encoding="utf-8")
    s, e = marker(name, "start"), marker(name, "end")
    pat = re.compile(re.escape(s) + r".*?" + re.escape(e), re.S)
    if not pat.search(src):
        return "NO %s MARKERS" % name, False
    src = pat.sub(lambda _: "%s\n%s\n%s" % (s, body, e), src, count=1)
    changed = src != original
    if changed and not check:
        path.write_text(src, encoding="utf-8")
    return ("would update" if check else "updated") if changed else "no change", changed


def main():
    check = "--check" in sys.argv
    posts, bad = load_posts()

    for p in bad:
        print("SKIPPED %-44s missing: %s" % (p["slug"], ", ".join(p["missing"])))
    for p in posts:
        if missing_image(p):
            print("WARNING %-44s card image not on disk: %s" % (p["slug"], p["image"]))
    if bad:
        print()

    print("%d post(s) in order, newest first:" % len(posts))
    for i, p in enumerate(posts, 1):
        print("  %2d. %-12s %-44s %s" % (i, p["date"], p["slug"], kicker_line(p)))
    print()

    if not posts:
        print("no usable posts, nothing generated")
        return 1

    touched = 0
    for filename, name, render in BLOCKS:
        status, changed = apply_block(ROOT / filename, name, render(posts), check)
        if changed:
            touched += 1
        print("%-16s %-10s %s" % (filename, name, status))
    print("\n%d block(s) %s" % (touched, "would change" if check else "updated"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
