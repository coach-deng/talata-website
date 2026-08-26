#!/usr/bin/env python3
"""
Fetch opponent club crests into images/clubs/, for the fixture list.

WHY
---
The games page shows a crest either side of every fixture, the way every league
site does. Talata has its own mark; the opponents' come from each club's own
public website. Policy changed by Deng on 26 Aug 2026: a crest that a club
publishes openly is fair to use to identify that club in a fixture list.

HOW IT FINDS ONE
----------------
DBBF publishes no logo directory, so there is nothing to bulk-download. This
walks candidate domains per club, and on the first that answers, looks for a
crest in descending order of reliability:

    1. <link rel="apple-touch-icon">   nearly always the bare mark, square
    2. og:image                        usually the crest on a club site
    3. <img> whose src/alt/class says logo
    4. /favicon.svg, /favicon.ico      last resort, tiny but correct

Everything is written as `<slug>.<ext>` and normalised to 160px tall so the
strip renders evenly. Existing files are never overwritten without --force,
because a hand-picked replacement must survive a re-run.

USAGE
    python3 tools/fetch-club-logos.py            # all clubs in data/fixtures.json
    python3 tools/fetch-club-logos.py --force
    python3 tools/fetch-club-logos.py --report   # what is missing, no network
"""

import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import List, Optional, Tuple
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "images" / "clubs"
FIXTURES = ROOT / "data" / "fixtures.json"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140 Safari/537.36")
MAX_H = 160

# Candidate domains per club, best guess first. Danish clubs are inconsistent:
# some are <club>basket.dk, some <club>basketball.dk, some a nickname entirely
# (Hørsholm play as the 79ers). Anything that fails here gets reported so the
# URL can be pasted into CLUBS by hand rather than guessed at forever.
CLUBS = {
    "alba":             ["albabasketball.dk", "alba-basket.dk", "albabasket.dk"],
    "bk-amager":        ["bkamager.dk", "amagerbasket.dk"],
    "bms-herlev":       ["bmsherlev.dk", "bms-herlev.dk"],
    "bronshoj":         ["dragonsbasketball.club", "bronshojbasket.dk"],
    "dtu":              ["dtubasket.klub-modul.dk", "dtubasket.dk"],
    "espergaerde":      ["espergaerdebasketball.dk", "ebbk.dk", "espergaerdebasket.dk"],
    "falcon":           ["falconbasket.dk", "falcon.dk", "falconbasketball.dk"],
    "fredensborg":      ["fredensborgbasketball.dk", "fbbk.dk"],
    "gladsaxe":         ["gladsaxebasketball.dk", "gladsaxebasket.dk"],
    "hovedstadens-bbf": ["hovedstadensbbf.dk", "hbbf.dk"],
    "horsholm":         ["79ers.dk", "horsholm79ers.dk", "hoersholm79ers.dk"],
    "koge-bugt":        ["koegebasket.dk", "kogebugtbasketball.dk"],
    "nsbu":             [],  # no website exists, monogram fallback
    "naestved":         ["naestvedbasketball.dk", "naestvedbasket.dk"],
    "roskilde":         ["rbbc.dk", "roskildebasketball.dk"],
    "sisu":             ["sisubasketball.dk", "sisu.dk", "sisubasket.dk"],
    "solrod":           ["solrodcomets.dk", "solrodbasketball.dk"],
    "stevnsgade":       ["sbbk.dk", "stevnsgade.dk"],
    "vaerlose":         ["vaerlosebasketball.dk", "vaerlosebasket.dk", "vbbk.dk"],
}

# How an opponent string in fixtures.json maps to a slug above. The export writes
# "SISU 2", "Falcon 3", "Hørsholm 1" for a club's second and third teams, so the
# trailing number is stripped before this lookup.
NAME_TO_SLUG = {
    "ALBA": "alba", "BK Amager": "bk-amager", "BMS Herlev": "bms-herlev",
    "Brønshøj": "bronshoj", "DTU": "dtu", "Espergærde": "espergaerde",
    "Falcon": "falcon", "Fredensborg": "fredensborg", "Gladsaxe": "gladsaxe",
    "Hovedstadens BBF": "hovedstadens-bbf", "Hørsholm": "horsholm",
    "Køge Bugt": "koge-bugt", "NSBU": "nsbu", "Næstved": "naestved",
    "Roskilde": "roskilde", "SISU": "sisu", "Solrød": "solrod",
    "Stevnsgade": "stevnsgade", "Værløse": "vaerlose",
}


def slug_for(opponent: str) -> Optional[str]:
    return NAME_TO_SLUG.get(re.sub(r"\s+\d+$", "", opponent or "").strip())


def get(url: str, timeout: int = 12) -> Optional[bytes]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except Exception:
        return None


def sniff(b: bytes) -> Optional[str]:
    if b[:4] == b"\x89PNG": return "png"
    if b[:3] == b"\xff\xd8\xff": return "jpg"
    if b[:6] in (b"GIF87a", b"GIF89a"): return "gif"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP": return "webp"
    if b[:4] == b"\x00\x00\x01\x00": return "ico"
    head = b[:800].lstrip().lower()
    if head.startswith(b"<svg") or b"<svg" in head: return "svg"
    return None


def candidates(html, base):
    """Logo URLs from one page, most reliable first."""
    found = []

    def add(u):
        if u and not u.startswith("data:"):
            full = urljoin(base, u.strip())
            if full not in found:
                found.append(full)

    for m in re.finditer(r'<link[^>]+rel=["\'][^"\']*apple-touch-icon[^"\']*["\'][^>]*>', html, re.I):
        href = re.search(r'href=["\']([^"\']+)', m.group(0), re.I)
        add(href.group(1) if href else None)

    for prop in ("og:image", "twitter:image"):
        m = re.search(rf'<meta[^>]+(?:property|name)=["\']{prop}["\'][^>]+content=["\']([^"\']+)', html, re.I)
        add(m.group(1) if m else None)

    for m in re.finditer(r"<img[^>]+>", html, re.I):
        tag = m.group(0)
        if re.search(r"logo|crest|badge|brand", tag, re.I):
            src = re.search(r'(?:data-)?src=["\']([^"\']+)', tag, re.I)
            add(src.group(1) if src else None)

    for m in re.finditer(r'<link[^>]+rel=["\'][^"\']*icon[^"\']*["\'][^>]*>', html, re.I):
        href = re.search(r'href=["\']([^"\']+)', m.group(0), re.I)
        add(href.group(1) if href else None)

    add("/favicon.svg")
    add("/favicon.ico")
    return found


def normalise(path: Path) -> None:
    """Cap height so every crest sits on the same baseline. SVG is left alone."""
    if path.suffix == ".svg":
        return
    try:
        subprocess.run(
            ["sips", "-Z", str(MAX_H), str(path)],
            check=True, capture_output=True,
        )
    except Exception:
        pass


def fetch_one(slug, domains, force):
    existing = list(OUT.glob(f"{slug}.*"))
    if existing and not force:
        return "kept", existing[0].name

    for domain in domains:
        for scheme in ("https://", "http://"):
            base = scheme + domain + "/"
            page = get(base)
            if not page:
                continue
            html = page.decode("utf-8", "ignore")
            for url in candidates(html, base):
                blob = get(url, timeout=10)
                # Under 300 bytes is a tracking pixel or an error page, and a
                # 2 MB hero photo is not a crest.
                if not blob or len(blob) < 300 or len(blob) > 3_000_000:
                    continue
                ext = sniff(blob)
                if not ext or ext == "gif":
                    continue
                OUT.mkdir(parents=True, exist_ok=True)
                for old in OUT.glob(f"{slug}.*"):
                    old.unlink()
                out = OUT / f"{slug}.{ext}"
                out.write_bytes(blob)
                normalise(out)
                return "got", f"{out.name}  <- {urlparse(url).netloc}{urlparse(url).path[:44]}"
    return "MISS", "no domain answered with a usable image"


def main() -> None:
    force = "--force" in sys.argv
    report = "--report" in sys.argv

    needed = set()
    if FIXTURES.exists():
        data = json.loads(FIXTURES.read_text(encoding="utf-8"))
        for g in data.get("games", []):
            s = slug_for(g.get("opponent", ""))
            if s:
                needed.add(s)
    needed = sorted(needed or CLUBS.keys())

    if report:
        for slug in needed:
            have = list(OUT.glob(f"{slug}.*"))
            print(f"  {'OK ' if have else 'MISSING'}  {slug:<18} {have[0].name if have else ''}")
        return

    got = miss = kept = 0
    for slug in needed:
        status, detail = fetch_one(slug, CLUBS.get(slug, []), force)
        print(f"  {status:<5} {slug:<18} {detail}")
        got += status == "got"
        miss += status == "MISS"
        kept += status == "kept"
    # The site resolves a crest through this manifest rather than guessing a
    # filename, because the extension varies by club (Køge Bugt ships a JPG) and
    # a club with no crest at all must fall back to a monogram, not a 404.
    manifest = {
        "names": NAME_TO_SLUG,
        "files": {
            slug: f"/images/clubs/{p.name}"
            for slug in sorted(CLUBS)
            for p in sorted(OUT.glob(f"{slug}.*"))
        },
    }
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "crests.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\nWrote data/crests.json ({len(manifest['files'])} crests)")
    print(f"{got} downloaded, {kept} already present, {miss} missing.")
    if miss:
        print("For a miss: find the club's real domain, add it to CLUBS, run again.")


if __name__ == "__main__":
    main()
