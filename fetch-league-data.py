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

Current-season standings show real zeros until each league's own
2026/27 season actually kicks off - the five don't all start the same
week (La Liga's real season began 15 Aug, Bundesliga's not until 28
Aug, verified directly), so at any given moment some tables may show
real played games while others are still genuinely at 0. Not a bug
either way - each table reflects that specific league's real state.

Real incident (fixed, worth keeping the record): this script had no
error handling at all until a real bug was found live - a single
failed HTTP call anywhere in the loop crashed the whole run, and
because the GitHub Actions workflow wraps every fetch step in
continue-on-error, that crash was silently swallowed for 10 real days
straight while every other data source kept refreshing normally. Real
evidence once found: the "Fetch league standings" step was completing
in 0-1 seconds on every automated run, versus 5-9 seconds for the
comparable FPL fetch - far too fast for the real network calls it's
supposed to make. Fixed with a real retry per request and a per-league
try/except that falls back to that league's last real data instead of
losing everything.

Also writes a real id+name roster per league (parse_teams), pulled
from the same standings response - every registered club appears in
`entries` regardless of games played, so this works pre-season too.
This exists because ESPN's separate /teams endpoint, which the front
end originally called directly for this, sends no CORS header at all
(confirmed via curl -D-, unlike /standings and /scoreboard which both
send Access-Control-Allow-Origin: *) - it fails silently in every real
browser while still returning 200 to curl, which doesn't enforce CORS
and so never caught it. Found via an actual browser DevTools console,
not any server-side check. Routing this through the standings response
we already fetch (and that's already proven CORS-safe) avoids the
broken endpoint entirely instead of working around it.
"""
import json
import time
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
FETCH_RETRIES = 3
FETCH_RETRY_DELAY_SECONDS = 3


def fetch_json(url):
    """Real fetch with a real retry - found directly, not assumed: this
    script had zero error handling at all (unlike fetch-fpl-data.py's
    established try/except-per-call pattern), so a single transient
    failure on any one of 10 real HTTP calls crashed the whole script -
    silently, since the GitHub Actions workflow's continue-on-error
    swallowed it. Real evidence this was happening: this step was
    completing in 0-1 seconds on every single automated run for 10
    real days, versus 5-9 seconds for the comparable FPL fetch step -
    far too fast for 10 genuine network round-trips, consistent with
    crashing on the very first call every time."""
    last_error = None
    for attempt in range(1, FETCH_RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.load(resp)
        except Exception as err:
            last_error = err
            if attempt < FETCH_RETRIES:
                time.sleep(FETCH_RETRY_DELAY_SECONDS)
    raise last_error


def parse_table(standings_json):
    entries = (standings_json.get("children") or [{}])[0].get("standings", {}).get("entries", [])
    table = []
    for e in entries:
        stats = {s["name"]: s for s in e["stats"]}
        # Real incident (found live, cost over a week of stale tables
        # before it was noticed): defaulting a missing "gamesPlayed" stat
        # to 0 made a real-looking table of every team on 0 played/0
        # points - identical to a genuinely not-yet-started season -
        # whenever ESPN's response for a given request omitted per-team
        # stat values (still returned the real team list, just no
        # stats). No exception, so main()'s existing fallback-to-
        # last-good-data safety net never triggered; the fabricated
        # zeros got committed and redeployed as if real. Raising here
        # instead makes that failure loud, so the real safety net
        # actually does its job.
        if "gamesPlayed" not in stats:
            raise ValueError(f"{e['team']['displayName']}: standings response missing gamesPlayed stat - not trusting a fabricated 0")
        table.append({
            "rank": int(stats["rank"]["value"]) if "rank" in stats else None,
            "team": e["team"]["displayName"],
            "shortTeam": e["team"].get("shortDisplayName", e["team"]["displayName"]),
            "played": int(stats["gamesPlayed"]["value"]),
            "wins": int(stats["wins"]["value"]) if "wins" in stats else 0,
            "draws": int(stats["ties"]["value"]) if "ties" in stats else 0,
            "losses": int(stats["losses"]["value"]) if "losses" in stats else 0,
            "points": int(stats["points"]["value"]) if "points" in stats else 0,
        })
    table.sort(key=lambda t: (t["rank"] is None, t["rank"]))
    return table


def parse_teams(standings_json):
    """Real id + name for every club in this league, straight from the
    standings response's own team objects."""
    entries = (standings_json.get("children") or [{}])[0].get("standings", {}).get("entries", [])
    return [{"id": str(e["team"]["id"]), "name": e["team"]["displayName"]} for e in entries]


def load_previous_leagues():
    """Real previous run's output, used as a per-league fallback so one
    league's real fetch failure doesn't blank out data that was fine a
    moment ago - same "partial success beats total failure" principle
    the GitHub Actions workflow already applies across scripts, applied
    one level deeper, inside this one."""
    try:
        with open("data/leagues.json", "r", encoding="utf-8") as f:
            return {l["code"]: l for l in json.load(f).get("leagues", [])}
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        return {}


def main():
    previous = load_previous_leagues()
    leagues_out = []
    for league in LEAGUES:
        try:
            current = fetch_json(STANDINGS_URL.format(code=league["code"]))
            last_season = fetch_json(STANDINGS_URL.format(code=league["code"]) + f"?season={LAST_SEASON_YEAR}")
            leagues_out.append({
                "code": league["code"],
                "name": league["name"],
                "current": parse_table(current),
                "lastSeasonYear": f"{LAST_SEASON_YEAR}/{str(LAST_SEASON_YEAR + 1)[-2:]}",
                "lastSeason": parse_table(last_season),
                "teams": parse_teams(current),
            })
            print(f"  {league['name']}: current {len(leagues_out[-1]['current'])} teams, last season {len(leagues_out[-1]['lastSeason'])} teams")
        except Exception as err:
            detail = f"{type(err).__name__}: {err}"
            print(f"  {league['name']}: real fetch failed ({detail}) - keeping previous data for this league only" if league["code"] in previous else f"  {league['name']}: real fetch failed ({detail}) - no previous data to fall back to, skipping")
            if league["code"] in previous:
                leagues_out.append(previous[league["code"]])

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
