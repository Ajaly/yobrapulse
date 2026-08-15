"""
Cross-checks every static #id selector referenced in app.js and auth.js
against the ids actually defined in app.html. Skips dynamic selectors built
with template literals (e.g. `#${viewName}-view`) since those can't be
checked statically.

Run from the repo root: python scripts/check-ids.py
Exits non-zero (and fails CI) if either script references an id that doesn't
exist in app.html - the exact bug class behind several dead-nav/missing-id
issues found earlier in this project.
"""
import re
import sys

JS_FILES = ["app.js", "auth.js"]

pattern = re.compile(
    r"""querySelector(?:All)?\(\s*['"`]#([a-zA-Z][a-zA-Z0-9_-]*)|"""
    r"""getElementById\(\s*['"]([a-zA-Z][a-zA-Z0-9_-]*)['"]"""
)

referenced = {}
for filename in JS_FILES:
    with open(filename, encoding="utf-8") as f:
        js = f.read()
    for m in pattern.finditer(js):
        referenced[m.group(1) or m.group(2)] = filename

with open("app.html", encoding="utf-8") as f:
    html = f.read()
defined = set(re.findall(r'id="([a-zA-Z][a-zA-Z0-9_-]*)"', html))

missing = sorted(referenced.items())
missing = [(i, f) for i, f in missing if i not in defined]
if missing:
    print("Missing DOM ids referenced but not found in app.html:")
    for i, f in missing:
        print(f" - {i} (from {f})")
    sys.exit(1)

print(f"OK: {len(referenced)} static DOM ids referenced across {', '.join(JS_FILES)} all exist in app.html")
