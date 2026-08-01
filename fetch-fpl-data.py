"""
Fetch real Fantasy Premier League data and write it to data/fpl.json for the
FPL assistant view to consume at runtime (same-origin fetch, no CORS issue).

Re-run this whenever you want to refresh the numbers, then re-deploy the
project folder (e.g. re-drop it on Netlify).

Scope note: as of when this was written, the FPL API is in pre-season, which
limits what's usable:
- Team/fixture data is NOT trustworthy - not just the two placeholder clubs
  (Coventry/Hull, which aren't really in the Premier League), but real
  player team assignments too (e.g. Antoine Semenyo was returned as
  "Man City" when he actually plays for Bournemouth). So this script
  deliberately does NOT fetch or expose team/fixture info at all.
- Transfer/price-movement data (transfers_in_event, cost_change_start, etc.)
  is entirely flat/zero this early in pre-season - nothing has happened yet.
  So this script does NOT attempt "transfer advice" recommendations; that
  panel stays as illustrative mock content in the front end for now.
Only player identity, position (a stable global constant, not tied to the
broken roster data), price, ownership, season points, and next-gameweek
projection (ep_next) are used. Re-check this note next time you run the
script - once the season is underway these restrictions can likely be lifted.
"""
import json
import urllib.request
from datetime import datetime, timezone

BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/"
HEADERS = {"User-Agent": "Mozilla/5.0"}

POSITIONS = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}
AVATAR_CLASSES = ["", "blue-avatar", "orange-avatar", "pink-avatar"]


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.load(resp)


def initials(name):
    parts = name.strip().split()
    letters = "".join(p[0] for p in parts if p)
    return (letters or name[:2]).upper()[:2]


def avatar_class(pid):
    return AVATAR_CLASSES[pid % len(AVATAR_CLASSES)]


def price_str(now_cost):
    return f"£{now_cost / 10:.1f}m"


def build_player(e):
    name = e.get("web_name") or f"{e['first_name']} {e['second_name']}"
    full_name = f"{e['first_name']} {e['second_name']}".strip()
    return {
        "id": e["id"],
        "name": full_name or name,
        "shortName": name,
        "position": POSITIONS.get(e["element_type"], "?"),
        "avatar": initials(full_name or name),
        "avatarClass": avatar_class(e["id"]),
        "price": price_str(e["now_cost"]),
        "owned": f"{float(e['selected_by_percent']):.1f}%",
        "points": e["total_points"],
        "epNext": float(e["ep_next"] or 0),
        "form": float(e["form"] or 0),
        "minutes": e["minutes"],
        "goals": e["goals_scored"],
        "assists": e["assists"],
    }


def main():
    data = fetch_json(BOOTSTRAP_URL)

    eligible = [e for e in data["elements"] if float(e["selected_by_percent"] or 0) >= 2.0]

    # Captain picks: highest projected points next gameweek, must be
    # currently available (not injured/suspended).
    captain_pool = [e for e in eligible if e.get("status") == "a"]
    captain_picks = sorted(captain_pool, key=lambda e: float(e["ep_next"] or 0), reverse=True)[:3]

    # Top performers: highest cumulative points (last completed season).
    top_performers = sorted(eligible, key=lambda e: e["total_points"], reverse=True)[:6]

    next_event = next((ev for ev in data["events"] if ev.get("is_next")), data["events"][0])
    deadline = datetime.fromisoformat(next_event["deadline_time"].replace("Z", "+00:00"))

    players_out = {}
    def register(e):
        p = build_player(e)
        players_out[str(p["id"])] = p
        return str(p["id"])

    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "Fantasy Premier League API (fantasy.premierleague.com)",
        "gameweek": {
            "name": next_event["name"],
            "deadlineISO": next_event["deadline_time"],
            "deadlineLabel": deadline.strftime("%a %d %b · %H:%M UTC"),
        },
        "captainPicks": [register(e) for e in captain_picks],
        "topPerformers": [register(e) for e in top_performers],
        "players": players_out,
    }

    with open("data/fpl.json", "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print(f"Wrote data/fpl.json — {len(players_out)} players, gameweek: {next_event['name']} ({result['gameweek']['deadlineLabel']})")


if __name__ == "__main__":
    main()
