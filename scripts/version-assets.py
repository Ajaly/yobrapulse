"""
Injects a real content-hash query string onto each versioned asset
reference in app.html (app.js, auth.js, styles.css), so a browser is
forced to fetch the real latest version whenever that specific file's
content actually changes, instead of silently serving a stale cached
copy.

Real incident this fixes: a real Wildcard Watch change was live on the
server (verified directly via curl) but invisible to a pilot tester
until a hard refresh, because their browser had cached the previous
app.js/app.html. GitHub Pages doesn't set aggressive cache-busting by
default, and neither did this project until now.

Run this after editing app.js, auth.js or styles.css, before
committing - same step as scripts/check-ids.py in the pre-commit
routine. Idempotent: safe to run even when nothing changed (the hash
stays the same, so app.html ends up byte-identical).

firebase-config.js is deliberately not included here - it's imported
from inside auth.js via a JS `import` statement, not referenced in
app.html, so a query string on an HTML tag can't reach it. In
practice this is fine: it's the Firebase project config, set once and
not expected to change again.
"""
import hashlib
import re

VERSIONED_FILES = ["app.js", "auth.js", "styles.css"]


def content_hash(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:8]


def main():
    with open("app.html", "r", encoding="utf-8") as f:
        html = f.read()

    for filename in VERSIONED_FILES:
        h = content_hash(filename)
        # Matches the real src=/href= reference to this exact file,
        # whether or not it already carries a ?v= from a previous run.
        pattern = re.compile(r'((?:src|href)=")' + re.escape(filename) + r'(?:\?v=[0-9a-f]+)?(")')
        html, count = pattern.subn(r"\g<1>" + filename + f"?v={h}" + r"\g<2>", html)
        print(f"{filename}: hash {h}, {count} reference(s) updated")

    with open("app.html", "w", encoding="utf-8") as f:
        f.write(html)


if __name__ == "__main__":
    main()
