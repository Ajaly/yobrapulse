"""
Fetch real football news from public RSS feeds and write it to data/news.json
for the News view to consume at runtime (same-origin fetch, no CORS issue).

Re-run this whenever you want to refresh the bulletins, then re-deploy the
project folder (e.g. re-drop it on Netlify).

Sources: BBC Sport and Sky Sports football RSS feeds - both public, both
explicitly designed for syndication (that's what RSS is for). Headline,
description and a link back to the original article are used as-is; nothing
here is AI-rewritten or embellished, by deliberate choice - the actual
reporting is displayed, with attribution, not a paraphrase of it.

Category (Transfer / Injury / Club news) is a simple keyword heuristic run
against each story's title+description - it's a real, inspectable rule, not
a model guessing. Good enough to sort stories into the right bucket most of
the time; it will occasionally misfile an ambiguous headline.
"""
import io
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

FEEDS = [
    {"url": "http://feeds.bbci.co.uk/sport/football/rss.xml", "source": "BBC Sport"},
    # Real bug, found in a pre-launch audit: /rss/12040 is Sky Sports'
    # general "News" feed (no <category>, mixes in rugby league,
    # snooker, anything) - verified directly, it was surfacing a real
    # rugby live-blog and even an unrelated criminal-trial story in a
    # football app. /rss/11095 is the real, correctly-scoped football
    # feed (verified: <description>Football News</description>,
    # <category>Football</category>, real transfer-news items only).
    {"url": "https://www.skysports.com/rss/11095", "source": "Sky Sports"},
]
HEADERS = {"User-Agent": "Mozilla/5.0"}
MAX_ITEMS = 12

INJURY_WORDS = [
    "injury", "injured", "scan", "surgery", "sidelined", "fitness test",
    "knock", "strain", "hamstring", "acl", "out for", "recovery", "setback",
    "ruled out", "doubt", "surgery",
]
TRANSFER_WORDS = [
    "sign", "signing", "signs", "transfer", "loan", "move to", "joins",
    "join", "unveiled", "fee agreed", "medical", "deal for", "deal to",
    "confirm the signing", "completes move", "agree deal", "swoop",
]


def fetch_bytes(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read()


def classify(text):
    lower = text.lower()
    if any(w in lower for w in INJURY_WORDS):
        return "injury", "Injury"
    if any(w in lower for w in TRANSFER_WORDS):
        return "transfer", "Transfer"
    return "club", "Club news"


def strip_tracking(link):
    return re.sub(r"\?at_medium=RSS.*$", "", link)


def parse_feed(feed):
    raw = fetch_bytes(feed["url"])
    root = ET.fromstring(raw)
    items = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        description = re.sub(r"\s+", " ", (item.findtext("description") or "")).strip()
        link = strip_tracking((item.findtext("link") or "").strip())
        pub_date_raw = item.findtext("pubDate")
        if not title or not link or not pub_date_raw:
            continue
        try:
            pub_date = parsedate_to_datetime(pub_date_raw)
        except (TypeError, ValueError):
            continue
        category, category_label = classify(title + " " + description)
        items.append({
            "title": title,
            "description": description,
            "link": link,
            "source": feed["source"],
            "category": category,
            "categoryLabel": category_label,
            "pubDateISO": pub_date.astimezone(timezone.utc).isoformat(),
        })
    return items


def main():
    all_items = []
    for feed in FEEDS:
        try:
            all_items.extend(parse_feed(feed))
        except Exception as exc:  # keep going if one feed is temporarily down
            print(f"Warning: failed to fetch {feed['source']}: {exc}")

    all_items.sort(key=lambda i: i["pubDateISO"], reverse=True)
    all_items = all_items[:MAX_ITEMS]

    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sources": [f["source"] for f in FEEDS],
        "items": all_items,
    }

    with open("data/news.json", "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print(f"Wrote data/news.json - {len(all_items)} stories from {len(FEEDS)} feeds")


if __name__ == "__main__":
    main()
