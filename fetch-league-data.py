"""
Fetch real multi-league standings (Premier League, La Liga, Serie A,
Bundesliga, Ligue 1) and write them to data/leagues.json.

Re-run this whenever you want to refresh the tables, then re-deploy
the project folder (e.g. re-drop it on Netlify).

Source: ESPN's public standings API (site.api.espn.com), which sends
Access-Control-Allow-Origin: * the same as the Live Scores data - no
API key needed, verified working for all five leagues below, including
querying a specific past season (?season=2025 returns the real,
complete 2025/26 final table).

Scope: real wins/draws/losses/points/rank at the TEAM level, current
and historical. This does NOT include player-level stats (goals,
defensive actions, etc.) for the four non-Premier-League leagues -
checked ESPN's leaders endpoint for La Liga/Serie A/Bundesliga and it
404s for all three. That data isn't available here; player-level
stats stay Premier-League-only (via fetch-fpl-data.py) until there's
a different source for it.

Current-season standings will mostly show zeros right now - it's
pre-season across all five leagues (same timing issue as everywhere
else in this project), not a bug. They'll fill in once each league's
season actually kicks off.
"""
import json
import urllib.request
from datetime import datetime, timezone

LEAGUES = [
    {"code": "eng.1", "name": "Premier League"},
    {"code": "esp.1", "name": "La Liga"},
    {"code": "ita.1", "name": "Serie A"},
    {"code": "ger.1", "name": "Bundesliga"},
    {"code": "fra.1", "name": "Ligue 1"},
]
LAST_SEASON_YEAR = 2025  # the just-completed 2025/26 season
HEADERS = {"User-Agent": "Mozilla/5.0"}
STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/soccer/{code}/standings"


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.load(resp)


def parse_table(standings_json):
    entries = (standings_json.get("children") or [{}])[0].get("standings", {}).get("entries", [])
    table = []
    for e in entries:
        stats = {s["name"]: s for s in e["stats"]}
        table.append({
            "rank": int(stats["rank"]["value"]) if "rank" in stats else None,
            "team": e["team"]["displayName"],
            "shortTeam": e["team"].get("shortDisplayName", e["team"]["displayName"]),
            "played": int(stats["gamesPlayed"]["value"]) if "gamesPlayed" in stats else 0,
            "wins": int(stats["wins"]["value"]) if "wins" in stats else 0,
            "draws": int(stats["ties"]["value"]) if "ties" in stats else 0,
            "losses": int(stats["losses"]["value"]) if "losses" in stats else 0,
            "points": int(stats["points"]["value"]) if "points" in stats else 0,
        })
    table.sort(key=lambda t: (t["rank"] is None, t["rank"]))
    return table


def main():
    leagues_out = []
    for league in LEAGUES:
        current = fetch_json(STANDINGS_URL.format(code=league["code"]))
        last_season = fetch_json(STANDINGS_URL.format(code=league["code"]) + f"?season={LAST_SEASON_YEAR}")
        leagues_out.append({
            "code": league["code"],
            "name": league["name"],
            "current": parse_table(current),
            "lastSeasonYear": f"{LAST_SEASON_YEAR}/{str(LAST_SEASON_YEAR + 1)[-2:]}",
            "lastSeason": parse_table(last_season),
        })
        print(f"  {league['name']}: current {len(leagues_out[-1]['current'])} teams, last season {len(leagues_out[-1]['lastSeason'])} teams")

    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "ESPN (site.api.espn.com)",
        "leagues": leagues_out,
    }

    with open("data/leagues.json", "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print(f"Wrote data/leagues.json - {len(leagues_out)} leagues")


if __name__ == "__main__":
    main()
