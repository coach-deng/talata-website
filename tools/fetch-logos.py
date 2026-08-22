#!/usr/bin/env python3
"""
Download third-party league logos into images/leagues/.

Usage:  python3 tools/fetch-logos.py logos.tsv
        (TSV: slug <TAB> url  — one per line, # comments ignored)

Validates that what came back is actually an image, normalises PNG/JPG to a
max height of 120px so the strip renders evenly, and leaves SVG untouched.
Never overwrites a file that already exists unless --force.
"""
import sys, os, re, subprocess, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "images" / "leagues"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36"
MAX_H = 120

def sniff(b: bytes) -> str:
    if b[:4] == b"\x89PNG": return "png"
    if b[:3] == b"\xff\xd8\xff": return "jpg"
    if b[:6] in (b"GIF87a", b"GIF89a"): return "gif"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP": return "webp"
    head = b[:600].lstrip()
    if head[:5] == b"<?xml" or head[:4] == b"<svg" or b"<svg" in b[:600]: return "svg"
    return ""

def fetch(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/*,*/*"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read()

def main():
    force = "--force" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print("need a tsv file"); return 1
    OUT.mkdir(parents=True, exist_ok=True)
    ok = fail = skip = 0
    for line in Path(args[0]).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"): continue
        parts = re.split(r"\t+|\s{2,}", line)
        if len(parts) < 2:
            print("  ?  malformed: %s" % line[:60]); continue
        slug, url = parts[0].strip(), parts[1].strip()
        existing = list(OUT.glob(slug + ".*"))
        if existing and not force:
            print("  =  %-22s already have %s" % (slug, existing[0].name)); skip += 1; continue
        try:
            data = fetch(url)
        except Exception as e:
            print("  x  %-22s %s" % (slug, str(e)[:60])); fail += 1; continue
        kind = sniff(data)
        if not kind:
            print("  x  %-22s not an image (%d bytes)" % (slug, len(data))); fail += 1; continue
        dest = OUT / ("%s.%s" % (slug, kind))
        dest.write_bytes(data)
        if kind in ("png", "jpg", "webp"):
            try:
                subprocess.run(["sips", "-Z", str(MAX_H * 2), str(dest)],
                               check=True, capture_output=True)
            except Exception:
                pass
        print("  ok %-22s %-5s %6d bytes" % (slug, kind, dest.stat().st_size)); ok += 1
    print("\n%d downloaded, %d skipped, %d failed" % (ok, skip, fail))
    return 0

if __name__ == "__main__":
    sys.exit(main())
