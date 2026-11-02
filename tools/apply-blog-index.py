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

OPTIONAL
    <meta name="talata:card-title">   the card headline, when og:title is Danish.
    <meta name="talata:card-desc">    the card blurb, when og:description is Danish.
                                      Cards are visible copy and stay English.
                                      og:title and og:description belong to the
                                      Danish SEO layer (Deng, 6 Oct 2026), so a
                                      post with a Danish head carries its English
                                      card text here. Without them the card falls
                                      back to the og tags.
    <meta name="talata:card-focus">   object-position for the card crop, e.g.
                                      "50% 30%". Card slots are wide and short,
                                      so a tall photo gets cover-cropped around
                                      its middle, which on a team photo is the
                                      shins. Faces usually sit in the top third,
                                      hence the default below. Set this per post
                                      when the subject sits somewhere else.

A post missing any of these is reported and skipped rather than half-rendered.

    python3 tools/apply-blog-index.py            # apply
    python3 tools/apply-blog-index.py --check    # report, change nothing
"""

import html
import json
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

# Where to hold the crop when a post does not say. Faces sit in the top third of
# almost every team and action photo, and the card slots are much wider than
# they are tall, so the browser default of "50% 50%" lands on legs and floor.
DEFAULT_FOCUS = "50% 30%"


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
        # English card text first, so a Danish og layer never reaches /blog or
        # the homepage (7 Oct 2026).
        "title": meta(src, "talata:card-title") or meta(src, "og:title"),
        "desc": meta(src, "talata:card-desc") or meta(src, "og:description"),
        "kicker": meta(src, "talata:kicker"),
        "event": meta(src, "talata:event"),
        "image": meta(src, "talata:card-image"),
        "alt": meta(src, "talata:card-alt"),
        "w": meta(src, "talata:card-w"),
        "h": meta(src, "talata:card-h"),
        "read": meta(src, "talata:read"),
        "focus": meta(src, "talata:card-focus") or DEFAULT_FOCUS,
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


# ------------------------------------------------------------------ club news

# Club news (2 Nov 2026). A result, a new team, a sign-up: one or two lines and a
# link, no full post to write. data/news.json, newest first:
#   {"items": [{"id", "date": "YYYY-MM-DD", "title", "text", "link",
#               "image"?, "alt"?, "w"?, "h"?, "source"?}]}
# The dash's Website card adds items on Approve. An item with a photo can lead
# the homepage Latest; every item shows in Club news at the top of /blog.
NEWS = ROOT / "data/news.json"
NEWS_ON_BLOG = 6
NEWS_NEEDS = ("id", "date", "title", "text", "link")
NEWS_ITEMS = []


def load_news():
    if not NEWS.exists():
        return [], []
    items = json.loads(NEWS.read_text(encoding="utf-8")).get("items") or []
    good, bad = [], []
    for it in items:
        miss = [k for k in NEWS_NEEDS if not it.get(k)]
        if it.get("image"):
            miss += [k for k in ("alt", "w", "h") if not it.get(k)]
            if not (ROOT / str(it["image"]).lstrip("/")).exists():
                miss.append("image on disk")
        (bad if miss else good).append(dict(it, missing=miss))
    good.sort(key=lambda it: it["date"], reverse=True)
    return good, bad


def day_line(iso):
    y, m, d = (int(x) for x in iso.split("-"))
    return "%d %s %d" % (d, MONTHS[m - 1], y)


def latest_cards(posts, news):
    """Posts and news with a photo, as one list for the homepage, newest first."""
    cards = [dict(p, href="/blog/%s" % p["slug"]) for p in posts]
    for it in news:
        if it.get("image"):
            cards.append({"href": it["link"], "date": it["date"], "kicker": "Club news",
                          "title": html.escape(it["title"]), "desc": html.escape(it["text"]),
                          "image": it["image"], "alt": html.escape(it["alt"], quote=True),
                          "w": it["w"], "h": it["h"], "focus": it.get("focus") or DEFAULT_FOCUS})
    cards.sort(key=lambda c: c["date"], reverse=True)
    return cards


def render_blog_news(news):
    if not news:
        return "  <!-- no club news yet -->"
    rows = []
    for it in news[:NEWS_ON_BLOG]:
        rows.append('      <a class="news-item" href="%s"><span class="news-date">%s</span><b>%s</b><span>%s</span></a>'
                    % (html.escape(it["link"], quote=True), day_line(it["date"]),
                       html.escape(it["title"]), html.escape(it["text"])))
    return """  <div class="news-wrap">
    <div class="grid-label">Club news</div>
    <div class="news-list">
%s
    </div>
  </div>""" % "\n".join(rows)


def kicker_line(p):
    return "%s &middot; %s" % (p["kicker"], p["event"])


def meta_line(p):
    return "%s &middot; %s min read" % (p["event"], p["read"])


def missing_image(p):
    """Cards must not point at an image that is not on disk."""
    return not (ROOT / p["image"].lstrip("/")).exists()


def one_line(desc):
    """The first sentence of the blurb (29 Oct 2026: title, date, one line)."""
    m = re.match(r"(.+?[.!?])(\s|$)", desc)
    return m.group(1) if m else desc


# ---------------------------------------------------------------- blog.html

def render_blog_list(posts):
    lead, rest = posts[0], posts[1:]
    cards = []
    for p in rest:
        cards.append(
            """
      <a href="/blog/{slug}" class="post-card">
        <img src="{image}" alt="{alt}" class="thumb" loading="lazy" decoding="async" width="{w}" height="{h}" style="object-position:{focus}" />
        <div class="card-body">
          <div class="meta">{date}</div>
          <h3>{title}</h3>
          <p>{desc}</p>
        </div>
      </a>""".format(
                slug=p["slug"], image=p["image"], alt=p["alt"], w=p["w"], h=p["h"],
                focus=p["focus"],
                date=p["event"], title=p["title"], desc=one_line(p["desc"])
            )
        )

    return """  <!-- FEATURED POST -->
  <div class="featured-wrap">
    <div class="featured-label">Latest post</div>
    <a href="/blog/{slug}" class="featured-card">
      <img src="{image}" alt="{alt}" class="card-img" fetchpriority="high" decoding="async" width="{w}" height="{h}" style="object-position:{focus}" />
      <div class="card-body">
        <div class="card-tag">{kicker}</div>
        <h2>{title}</h2>
        <p>{desc}</p>
        <div class="meta">{meta}</div>
        <span class="read-more" style="margin-top:20px;">Read post</span>
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
        focus=lead["focus"],
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
            """        <a class="story" href="{href}">
          <img src="{image}" alt="{alt}" loading="lazy" decoding="async" width="{w}" height="{h}" style="object-position:{focus}">
          <div class="grad"></div>
          <div class="txt"><span class="tag">{kicker}</span><h3>{title}</h3></div>
        </a>""".format(
                href=p["href"], image=p["image"].lstrip("/"), alt=p["alt"],
                w=p["w"], h=p["h"], focus=p["focus"],
                kicker=p["kicker"], title=p["title"]
            )
        )
    side_html.append(
        """        <a class="story" href="/reviews">
          <img src="images/2026-10/site/u13-grand-prix-team-with-coach.jpg" alt="Talata U13 players with their coach at a Grand Prix day" loading="lazy" decoding="async" width="1600" height="1067" style="object-position:50% 45%">
          <div class="grad"></div>
          <div class="txt"><span class="tag">Parents</span><h3>What families say about us</h3></div>
        </a>"""
    )

    return """    <div class="head"><h2>Latest</h2><a href="/blog">All stories</a></div>
    <div class="latest">
      <a class="story" href="{href}">
        <img src="{image}" alt="{alt}" loading="lazy" decoding="async" width="{w}" height="{h}" style="object-position:{focus}">
        <div class="grad"></div>
        <div class="txt"><span class="tag">{kicker}</span><h3>{title}</h3><p>{desc}</p></div>
      </a>
      <div class="sidecards">
{side}
      </div>
    </div>""".format(
        href=lead["href"], image=lead["image"].lstrip("/"), alt=lead["alt"],
        w=lead["w"], h=lead["h"], focus=lead["focus"],
        kicker=lead["kicker"], title=lead["title"],
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
    ("blog.html", "NEWS", lambda posts: render_blog_news(NEWS_ITEMS)),
    ("index.html", "LATEST", lambda posts: render_home_latest(latest_cards(posts, NEWS_ITEMS))),
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
    global NEWS_ITEMS
    check = "--check" in sys.argv
    posts, bad = load_posts()
    NEWS_ITEMS, bad_news = load_news()
    for it in bad_news:
        print("SKIPPED news %-38s missing: %s" % (it.get("id") or it.get("title"), ", ".join(it["missing"])))

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
