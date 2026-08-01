"""
Cross-checks every static #id selector referenced in app.js against the ids
actually defined in app.html. Skips dynamic selectors built with template
literals (e.g. `#${viewName}-view`) since those can't be checked statically.

Run from the repo root: python scripts/check-ids.py
Exits non-zero (and fails CI) if app.js references an id that doesn't exist
in app.html - the exact bug class behind several dead-nav/missing-id issues
found earlier in this project.
"""
import re
import sys

with open("app.js", encoding="utf-8") as f:
    js = f.read()
with open("app.html", encoding="utf-8") as f:
    html = f.read()

pattern = re.compile(
    r"""querySelector(?:All)?\(\s*['"`]#([a-zA-Z][a-zA-Z0-9_-]*)|"""
    r"""getElementById\(\s*['"]([a-zA-Z][a-zA-Z0-9_-]*)['"]"""
)
referenced = {m.group(1) or m.group(2) for m in pattern.finditer(js)}

defined = set(re.findall(r'id="([a-zA-Z][a-zA-Z0-9_-]*)"', html))

missing = sorted(referenced - defined)
if missing:
    print("Missing DOM ids referenced by app.js but not found in app.html:")
    for i in missing:
        print(" -", i)
    sys.exit(1)

print(f"OK: {len(referenced)} static DOM ids referenced in app.js all exist in app.html")
