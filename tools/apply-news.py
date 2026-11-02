#!/usr/bin/env python3
"""Club news (2 Nov 2026) lives in data/news.json and is built by
tools/apply-blog-index.py, which owns /blog and the homepage Latest. This name
exists so the dash's Website card can call apply-news.py after it adds an item."""
import runpy
import sys
from pathlib import Path

sys.argv[0] = str(Path(__file__).with_name("apply-blog-index.py"))
runpy.run_path(sys.argv[0], run_name="__main__")
