"""
Fetch real Fantasy Premier League data and write it to data/fpl.json for the
FPL assistant view to consume at runtime (same-origin fetch, no CORS issue).

Re-run this whenever you want to refresh the numbers, then re-deploy the
project folder (e.g. re-drop it on Netlify).

Correction (kept here for the record): an earlier version of this script
deliberately excluded team/fixture data, on the theory that the API's
pre-season roster was unreliable (e.g. it showed Coventry City and Hull
City as Premier League clubs, and Antoine Semenyo at Man City). That
theory was checked against official sources (premierleague.com, the
clubs' own sites) and was wrong: Coventry and Hull were legitimately
promoted for 2026/27, and Semenyo's £64m move to Man City in January
2026 was real. The API was right; the assumption that it wasn't wasn't
verified before excluding data on the strength of it. Team/fixture data
is included below.

What's still deliberately NOT included: transfer/price-movement data
(transfers_in_event, cost_change_start, etc.) is genuinely flat/zero
this early in pre-season - that's a direct read of the API's own
numbers, not a guess, so "transfer advice" recommendations aren't
built from it. That panel stays as illustrative content in the front
end for now; revisit once the season is underway and this data starts
moving.
"""
import json
import urllib.request
from datetime import datetime, timezone

BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/"
FIXTURES_URL = "https://fantasy.premierleague.com/api/fixtures/?event={event_id}"
HEADERS = {"User-Agent": "Mozilla/5.0"}

POSITIONS = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}
AVATAR_CLASSES = ["", "blue-avatar", "orange-avatar", "pink-avatar"]
FDR_CLASS = {1: "easy", 2: "easy", 3: "mid", 4: "hard", 5: "hard"}


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


def build_fixture_lookup(fixtures, teams):
    """team_id -> {opponent, isHome, fdr, fdrClass} for the given gameweek's fixtures."""
    lookup = {}
    for f in fixtures:
        lookup[f["team_h"]] = {
            "opponent": teams[f["team_a"]],
            "isHome": True,
            "fdr": f["team_h_difficulty"],
            "fdrClass": FDR_CLASS.get(f["team_h_difficulty"], "mid"),
        }
        lookup[f["team_a"]] = {
            "opponent": teams[f["team_h"]],
            "isHome": False,
            "fdr": f["team_a_difficulty"],
            "fdrClass": FDR_CLASS.get(f["team_a_difficulty"], "mid"),
        }
    return lookup


def build_player(e, teams, fixture_lookup):
    name = e.get("web_name") or f"{e['first_name']} {e['second_name']}"
    full_name = f"{e['first_name']} {e['second_name']}".strip()
    fixture = fixture_lookup.get(e["team"])
    player = {
        "id": e["id"],
        "name": full_name or name,
        "shortName": name,
        "position": POSITIONS.get(e["element_type"], "?"),
        "team": teams[e["team"]],
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
    if fixture:
        player["fixture"] = f"vs {fixture['opponent']} ({'H' if fixture['isHome'] else 'A'})"
        player["fdr"] = fixture["fdr"]
        player["fdrClass"] = fixture["fdrClass"]
    return player


def main():
    data = fetch_json(BOOTSTRAP_URL)
    teams = {t["id"]: t["name"] for t in data["teams"]}

    next_event = next((ev for ev in data["events"] if ev.get("is_next")), data["events"][0])
    fixtures = fetch_json(FIXTURES_URL.format(event_id=next_event["id"]))
    fixture_lookup = build_fixture_lookup(fixtures, teams)

    eligible = [e for e in data["elements"] if float(e["selected_by_percent"] or 0) >= 2.0]

    # Captain picks: highest projected points next gameweek, must be
    # currently available (not injured/suspended).
    captain_pool = [e for e in eligible if e.get("status") == "a"]
    captain_picks = sorted(captain_pool, key=lambda e: float(e["ep_next"] or 0), reverse=True)[:3]

    # Top performers: highest cumulative points (last completed season).
    top_performers = sorted(eligible, key=lambda e: e["total_points"], reverse=True)[:6]

    deadline = datetime.fromisoformat(next_event["deadline_time"].replace("Z", "+00:00"))

    players_out = {}
    def register(e):
        p = build_player(e, teams, fixture_lookup)
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

    print(f"Wrote data/fpl.json - {len(players_out)} players, gameweek: {next_event['name']} ({result['gameweek']['deadlineLabel']})")


if __name__ == "__main__":
    main()
